import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import BetygSattning from '../../src/views/Teacher/BetygSattning.vue'

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
            isAdmin: true,
        },
    }),
}))

vi.mock('vue-router', () => ({
    useRouter: () => ({ push: vi.fn() }),
}))

vi.mock('@/composables/useToast.js', () => ({
    useToast: () => ({
        success: vi.fn(),
        error: vi.fn(),
        warning: vi.fn(),
        info: vi.fn(),
    }),
}))

import client from '@/api/client.js'

const enrollmentItem = (overrides = {}) => ({
    student: { _id: 'stu-1', name: 'Anna Elev', email: 'a@b', teacherId: null },
    courseInstance: {
        _id: 'ci-1',
        courseCode: 'ENGENG05',
        mainCourseId: { _id: 'course-1', courseCode: 'ENGENG05', courseName: 'Engelska 5' },
        courseName: 'Engelska 5',
        responsibleTeacher: null,
    },
    endDate: '2025-03-15T00:00:00.000Z',
    grade: null,
    reason: '',
    comments: '',
    npScore: 80,
    enrollmentId: 'enroll-1',
    source: 'enrollment',
    ...overrides,
})

describe('BetygSattning.vue - national-test points (NP-poäng)', () => {
    let wrapper

    const mountPage = async (items) => {
        client.get.mockResolvedValue({ data: items })
        wrapper = mount(BetygSattning)
        await wrapper.vm.$nextTick()
        await new Promise((r) => setTimeout(r, 0))
        await wrapper.vm.$nextTick()
    }

    beforeEach(() => {
        vi.resetAllMocks()
    })

    it('loads npScore from the backend into the course row', async () => {
        await mountPage([enrollmentItem()])

        const rows = wrapper.vm.studentsToGrade
        expect(rows).toHaveLength(1)
        expect(rows[0].coursesToGrade[0].npScore).toBe(80)
    })

    it('renders an NP-poäng input for national courses and a dash otherwise', async () => {
        await mountPage([
            enrollmentItem(),
            enrollmentItem({
                student: { _id: 'stu-2', name: 'Bosse', email: 'b@b', teacherId: null },
                courseInstance: {
                    _id: 'ci-2',
                    courseCode: 'FYS01',
                    mainCourseId: { _id: 'course-2', courseCode: 'FYS01', courseName: 'Fysik' },
                    courseName: 'Fysik',
                    responsibleTeacher: null,
                },
                enrollmentId: 'enroll-2',
                npScore: null,
            }),
        ])

        const npCells = wrapper.findAll('.np-score-cell')
        expect(npCells.length).toBeGreaterThan(0)
        expect(npCells[0].find('input').exists()).toBe(true)
        expect(wrapper.text()).toContain('NP-poäng')
    })

    it('sends nationalTestPoints when saving an enrollment-based grade', async () => {
        await mountPage([enrollmentItem()])
        client.put.mockResolvedValue({ data: { success: true } })

        const course = wrapper.vm.studentsToGrade[0].coursesToGrade[0]
        course.grade = 'B'
        course.reason = 'Bra'
        course.npScore = 85

        await wrapper.vm.saveGrade('stu-1', course)

        expect(client.put).toHaveBeenCalledWith(
            '/update-grade/enroll-1',
            expect.objectContaining({
                grade: 'B',
                motivation: 'Bra',
                nationalTestPoints: 85,
            })
        )
    })

    it('sends npScore when saving a legacy education grade', async () => {
        await mountPage([
            enrollmentItem({
                student: { _id: 'stu-3', name: 'Cecilia', email: 'c@b', teacherId: null },
                courseInstance: null,
                source: 'student_education',
                courseRefId: 'course-9',
                courseCode: 'MA01',
                courseName: 'Matematik 1',
                enrollmentId: 'edu-9',
                npScore: 72,
            }),
        ])
        client.post.mockResolvedValue({ data: '✅ Betyg sparat!' })

        const course = wrapper.vm.studentsToGrade[0].coursesToGrade[0]
        course.grade = 'C'
        course.reason = 'Ok'

        await wrapper.vm.saveGrade('stu-3', course)

        expect(client.post).toHaveBeenCalledWith(
            '/teacher/save-grade/',
            expect.objectContaining({
                studentId: 'stu-3',
                courseId: 'course-9',
                npScore: 72,
                type: 'Course',
            })
        )
    })

    it('suggests a grade from the annual grading scale', async () => {
        client.get.mockResolvedValue({ data: [] })
        wrapper = mount(BetygSattning)
        await wrapper.vm.$nextTick()

        client.get.mockResolvedValue({ data: { grade: 'B', hasScale: true } })

        const course = {
            courseCode: 'ENGENG05',
            endDate: '2025-03-15T00:00:00.000Z',
            npScore: 82,
            suggestedGrade: null,
            suggestedChecked: false,
        }

        await wrapper.vm.suggestGrade(course)

        expect(client.get).toHaveBeenCalledWith('/grading-scale/suggest', {
            params: { term: 'VT25', subject: 'Engelska', points: 82 },
        })
        expect(course.suggestedGrade).toBe('B')
        expect(course.suggestChecked).toBe(true)
    })
})
