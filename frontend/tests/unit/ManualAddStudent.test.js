import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ManualAddStudent from '../../src/views/Admin/ManualAddStudent.vue'

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

describe('ManualAddStudent.vue', () => {
    let wrapper
    let vuetify

    const mountForm = async () => {
        wrapper = mount(ManualAddStudent, {
            global: {
                plugins: [vuetify],
            },
        })
        await wrapper.vm.$nextTick()
    }

    beforeEach(async () => {
        vi.resetAllMocks()

        client.get.mockImplementation((url) => {
            if (url === '/programs') return Promise.resolve({ data: [] })
            if (url === '/teachers') return Promise.resolve({ data: [] })
            if (url === '/courses') return Promise.resolve({ data: [] })
            return Promise.reject(new Error(`404 Not Found: ${url}`))
        })
        client.post.mockResolvedValue({ data: { name: 'New Student' } })

        await mountForm()
    })

    it('defaults examMode to on-site', () => {
        expect(wrapper.vm.studentForm.examMode).toBe('on-site')
    })

    it('auto-sets examMode to remote when Upplands Bro is selected', async () => {
        wrapper.vm.studentForm.municipality = 'Upplands Bro'
        await wrapper.vm.$nextTick()
        expect(wrapper.vm.studentForm.examMode).toBe('remote')
    })

    it('auto-sets examMode back to on-site for other municipalities', async () => {
        wrapper.vm.studentForm.municipality = 'Upplands Bro'
        await wrapper.vm.$nextTick()
        expect(wrapper.vm.studentForm.examMode).toBe('remote')

        wrapper.vm.studentForm.municipality = 'Sollentuna'
        await wrapper.vm.$nextTick()
        expect(wrapper.vm.studentForm.examMode).toBe('on-site')
    })

    it('preserves a manual override after the auto-set', async () => {
        wrapper.vm.studentForm.municipality = 'Upplands Bro'
        await wrapper.vm.$nextTick()
        wrapper.vm.studentForm.examMode = 'on-site'
        await wrapper.vm.$nextTick()
        expect(wrapper.vm.studentForm.examMode).toBe('on-site')
    })

    it('normalizes municipality variants via getDefaultExamMode', () => {
        expect(wrapper.vm.getDefaultExamMode('Upplands Bro')).toBe('remote')
        expect(wrapper.vm.getDefaultExamMode('Upplands-Bro')).toBe('remote')
        expect(wrapper.vm.getDefaultExamMode('upplands bro')).toBe('remote')
        expect(wrapper.vm.getDefaultExamMode('Sollentuna')).toBe('on-site')
        expect(wrapper.vm.getDefaultExamMode('')).toBe('on-site')
    })

    it('sends the auto-set examMode and municipality type in the payload', async () => {
        wrapper.vm.studentForm.name = 'Anna Exempel'
        wrapper.vm.studentForm.personalNumber = '20000101-0000'
        wrapper.vm.studentForm.email = 'anna@example.com'
        wrapper.vm.studentForm.startDate = '2025-01-15'
        wrapper.vm.studentForm.studyPace = '5'
        wrapper.vm.studentForm.municipality = 'Upplands Bro'
        await wrapper.vm.$nextTick()
        wrapper.vm.addedCourses = [
            {
                _id: 'c1',
                type: 'Course',
                courseCode: 'C1',
                courseName: 'Course One',
                displayText: 'Course One (C1)',
            },
        ]

        await wrapper.vm.submitStudentForm()

        expect(client.post).toHaveBeenCalledWith(
            '/student',
            expect.objectContaining({
                examMode: 'remote',
                municipality: { type: 'Upplands Bro' },
                education: expect.arrayContaining([
                    expect.objectContaining({ type: 'Course', refId: 'c1' }),
                ]),
            })
        )
    })

    it('sends excludedCourseIds for unchecked courses in a revised package', async () => {
        wrapper.vm.studentForm.name = 'Petter Paket'
        wrapper.vm.studentForm.personalNumber = '20000102-0000'
        wrapper.vm.studentForm.email = 'petter@example.com'
        wrapper.vm.studentForm.startDate = '2025-02-03'
        wrapper.vm.studentForm.studyPace = '5'

        wrapper.vm.availableCoursePackages = [
            {
                _id: 'pkg-1',
                coursePackageName: 'Paket Ett',
                coursePackageCode: 'PKG1',
                coursePackageCourses: [
                    { _id: 'course-a', courseName: 'Kurs A', courseCode: 'A1' },
                    { _id: 'course-b', courseName: 'Kurs B', courseCode: 'B1' },
                ],
            },
        ]
        await wrapper.vm.onCoursePackageChange('pkg-1')

        expect(wrapper.vm.selectedPackageCourses).toHaveLength(2)
        wrapper.vm.selectedPackageCourses[1].included = false

        await wrapper.vm.submitStudentForm()

        expect(client.post).toHaveBeenCalledWith(
            '/student',
            expect.objectContaining({
                education: expect.arrayContaining([
                    expect.objectContaining({
                        type: 'CoursePackage',
                        refId: 'pkg-1',
                        excludedCourseIds: ['course-b'],
                    }),
                ]),
            })
        )
    })

    it('sends priorAplCompleted and uploads the intyg to Dokument-fliken', async () => {
        wrapper.vm.studentForm.name = 'Greta Praktik'
        wrapper.vm.studentForm.personalNumber = '20000103-0000'
        wrapper.vm.studentForm.email = 'greta@example.com'
        wrapper.vm.studentForm.startDate = '2025-02-03'
        wrapper.vm.studentForm.studyPace = '5'
        wrapper.vm.studentForm.priorAplCompleted = true
        wrapper.vm.addedCourses = [
            {
                _id: 'c1',
                type: 'Course',
                courseCode: 'C1',
                courseName: 'Course One',
                displayText: 'Course One (C1)',
            },
        ]

        const file = new File(['intyg'], 'intyg.pdf', { type: 'application/pdf' })
        wrapper.vm.aplIntygFile = file

        client.post.mockImplementation((url, payload) => {
            if (url === '/student') {
                return Promise.resolve({ data: { _id: 'stu-greta' } })
            }
            if (url === '/documents/upload') {
                return Promise.resolve({ data: { _id: 'doc-intyg' } })
            }
            return Promise.resolve({ data: payload })
        })

        await wrapper.vm.submitStudentForm()

        expect(client.post).toHaveBeenCalledWith(
            '/student',
            expect.objectContaining({ priorAplCompleted: true })
        )
        expect(client.post).toHaveBeenCalledWith(
            '/documents/upload',
            expect.any(FormData),
            expect.objectContaining({ headers: { 'Content-Type': 'multipart/form-data' } })
        )
        expect(client.put).toHaveBeenCalledWith('/student/stu-greta', {
            priorAplIntygDocId: 'doc-intyg',
        })
    })
})
