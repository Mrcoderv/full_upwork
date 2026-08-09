import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import StudyPlanTab from '../../src/views/Student/tabs/StudyPlanTab.vue'

vi.mock('@/api/client.js', () => ({
    default: {
        get: vi.fn(),
        post: vi.fn(),
        put: vi.fn(),
        delete: vi.fn(),
        interceptors: {
            request: { use: vi.fn() },
            response: { use: vi.fn() },
        },
    },
}))

vi.mock('vuex', () => ({
    useStore: () => ({
        getters: {
            userRole: 'teacher',
        },
    }),
}))

import client from '@/api/client.js'

const mockToast = vi.hoisted(() => ({
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
}))

vi.mock('@/composables/useToast.js', () => ({
    useToast: () => mockToast,
}))

const completedCourse = (overrides = {}) => ({
    _id: 'enroll-1',
    enrollmentId: 'enroll-1',
    type: 'Course',
    isEnrollment: true,
    status: 'completed',
    name: 'Matematik 1',
    grade: 'E',
    startDate: '2025-01-06T00:00:00.000Z',
    endDate: '2025-01-31T00:00:00.000Z',
    refId: { _id: 'course-1', courseName: 'Matematik 1' },
    ...overrides,
})

const buildStudent = (education) => ({
    _id: 'stu-1',
    name: 'Anna Elev',
    enrollmentStats: {
        totalEnrollments: education.length,
        activeEnrollments: 1,
        completedEnrollments: education.filter((e) => e.status === 'completed').length,
    },
    education,
})

describe('StudyPlanTab.vue - "Lästa kurser" re-registration', () => {
    let wrapper

    const mountTab = async (student) => {
        wrapper = mount(StudyPlanTab, {
            props: { student },
        })
        await wrapper.vm.$nextTick()
    }

    beforeEach(() => {
        vi.resetAllMocks()
        client.get.mockResolvedValue({ data: buildStudent([]) })
        client.post.mockResolvedValue({ data: { success: true } })
        client.put.mockResolvedValue({ data: {} })
        client.delete.mockResolvedValue({})
    })

    it('computes completed courses from enrollment entries only', async () => {
        const student = buildStudent([
            completedCourse(),
            completedCourse({
                _id: 'enroll-2',
                enrollmentId: 'enroll-2',
                name: 'Svenska 1',
                refId: { _id: 'course-2', courseName: 'Svenska 1' },
            }),
            {
                _id: 'enroll-3',
                enrollmentId: 'enroll-3',
                type: 'Course',
                isEnrollment: true,
                status: 'enrolled',
                name: 'Engelska 5',
                startDate: '2025-03-03T00:00:00.000Z',
                endDate: '2025-04-04T00:00:00.000Z',
                refId: { _id: 'course-3', courseName: 'Engelska 5' },
            },
        ])
        await mountTab(student)

        expect(wrapper.vm.completedCourses).toHaveLength(2)
        expect(wrapper.vm.completedCourses.map((c) => c.name).sort()).toEqual([
            'Matematik 1',
            'Svenska 1',
        ])
    })

    it('renders the "Lästa kurser" section with a Ny antagning button per completed course', async () => {
        const student = buildStudent([completedCourse()])
        await mountTab(student)

        expect(wrapper.find('.completed-courses-section').exists()).toBe(true)
        expect(wrapper.text()).toContain('Lästa kurser')
        expect(wrapper.text()).toContain('Matematik 1')
        expect(wrapper.findAll('.reenroll-button')).toHaveLength(1)
    })

    it('hides the section when there are no completed courses', async () => {
        const student = buildStudent([
            {
                _id: 'enroll-3',
                enrollmentId: 'enroll-3',
                type: 'Course',
                isEnrollment: true,
                status: 'enrolled',
                name: 'Engelska 5',
                startDate: '2025-03-03T00:00:00.000Z',
                endDate: '2025-04-04T00:00:00.000Z',
                refId: { _id: 'course-3', courseName: 'Engelska 5' },
            },
        ])
        await mountTab(student)

        expect(wrapper.find('.completed-courses-section').exists()).toBe(false)
        expect(wrapper.vm.completedCourses).toHaveLength(0)
    })

    it('re-enrolls a completed course with dates following the last scheduled course', async () => {
        const student = buildStudent([completedCourse()])
        await mountTab(student)

        const refreshed = buildStudent([
            completedCourse(),
            {
                _id: 'enroll-new',
                enrollmentId: 'enroll-new',
                type: 'Course',
                isEnrollment: true,
                status: 'enrolled',
                name: 'Matematik 1',
                startDate: '2025-02-01T00:00:00.000Z',
                endDate: '2025-03-08T00:00:00.000Z',
                refId: { _id: 'course-1', courseName: 'Matematik 1' },
            },
        ])
        client.get.mockImplementation((url) => {
            if (url === '/student-details/stu-1') {
                return Promise.resolve({ data: refreshed })
            }
            return Promise.reject(new Error(`404 Not Found: ${url}`))
        })

        await wrapper.vm.handleReEnroll(wrapper.vm.completedCourses[0])

        expect(client.post).toHaveBeenCalledWith(
            '/course-matching/process-education',
            expect.objectContaining({
                studentId: 'stu-1',
                educationEntries: [
                    expect.objectContaining({
                        type: 'Course',
                        refId: 'course-1',
                        name: 'Matematik 1',
                        startDate: '2025-02-01',
                        endDate: '2025-03-08',
                    }),
                ],
            })
        )
        expect(client.get).toHaveBeenCalledWith('/student-details/stu-1')
        expect(wrapper.emitted('student-updated')).toBeTruthy()
        expect(wrapper.emitted('student-updated')[0][0]).toEqual(refreshed)
        expect(mockToast.success).toHaveBeenCalledWith(
            'Eleven har anmälts till kursen "Matematik 1" igen.'
        )
    })

    it('shows an error toast when re-enrollment fails', async () => {
        const student = buildStudent([completedCourse()])
        await mountTab(student)

        client.post.mockRejectedValue({
            response: { data: { error: 'Server error' } },
        })

        await wrapper.vm.handleReEnroll(wrapper.vm.completedCourses[0])

        expect(mockToast.error).toHaveBeenCalledWith(
            'Kunde inte anmäla eleven till kursen igen: Server error'
        )
        expect(wrapper.emitted('student-updated')).toBeFalsy()
    })
})
