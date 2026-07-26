import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import EducationEditor from '../../src/views/Admin/EducationEditor.vue'

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

describe('EducationEditor.vue', () => {
    let wrapper
    let vuetify

    const mountEditor = async () => {
        wrapper = mount(EducationEditor, {
            global: {
                plugins: [vuetify],
            },
        })
        await wrapper.vm.$nextTick()
    }

    beforeEach(async () => {
        vi.resetAllMocks()

        const mockStudents = [
            { _id: '1', name: 'John Doe', personalNumber: '123456789', email: 'john@example.com' },
        ]
        const mockPrograms = [{ _id: '1', programName: 'Test Program' }]
        const mockCourses = [
            {
                _id: '101',
                courseName: 'Test Course',
                courseCode: 'TC101',
                displayText: 'Test Course (TC101)',
            },
        ]

        client.get.mockImplementation((url) => {
            if (url.includes('/students')) return Promise.resolve({ data: mockStudents })
            if (url.includes('/all-programs')) return Promise.resolve({ data: mockPrograms })
            if (url.includes('/program/1/courses')) return Promise.resolve({ data: mockCourses })
            return Promise.reject(new Error(`404 Not Found: ${url}`))
        })

        client.post.mockResolvedValue({ data: 'Course added successfully' })
        client.put.mockResolvedValue({ data: { _id: '1', dropout: true } })
        client.delete.mockResolvedValue({})

        await mountEditor()
    })

    it('fetches and loads students correctly', async () => {
        console.log('MOCKED client:', client.get.mock.calls)

        await wrapper.vm.fetchInitialData()

        console.log('STUDENT DATA:', wrapper.vm.students)

        expect(client.get).toHaveBeenCalledWith('/students')
        expect(wrapper.vm.students.length).toBe(1)
    })

    it('handles error on fetchInitialData', async () => {
        await wrapper.unmount()
        client.get.mockRejectedValue(new Error('Network Error'))
        await mountEditor()
        expect(wrapper.vm.students.length).toBe(0)
    })
    it('does not fetch courses if no program is selected', async () => {
        wrapper.vm.selectedProgram = null;
        await wrapper.vm.fetchAllCourses();
    });
    it('handles error when fetching courses', async () => {
        client.get.mockImplementation((url) => {
            if (url.includes('/program/1/courses')) {
                return Promise.reject(new Error('Network Error'))
            }
            return Promise.resolve({ data: [] })
        })
        wrapper.vm.selectedProgram = '1'
        await wrapper.vm.fetchAllCourses()
    })
    it('does not add course if no student is selected', async () => {
        wrapper.vm.selectedStudent = null;
        wrapper.vm.selectedIndividualCourse = '101';
        await wrapper.vm.handleAddCourse();
    });
    it('does not add course if no course is selected', async () => {
        wrapper.vm.selectedStudent = { _id: '1' };
        wrapper.vm.selectedIndividualCourse = null;
        await wrapper.vm.handleAddCourse();
    });
    it('handles error when adding a course', async () => {
        client.post.mockRejectedValue(new Error('Network Error'));
        wrapper.vm.selectedStudent = { _id: '1' };
        wrapper.vm.selectedIndividualCourse = '101';
        await wrapper.vm.handleAddCourse();
    });
    it('shows top 5 students when search query is empty', async () => {
        wrapper.vm.searchQuery = ''
        const students = [
            { name: 'Alice' },
            { name: 'Bob' },
            { name: 'Charlie' },
            { name: 'David' },
            { name: 'Eve' },
            { name: 'Frank' },
        ]
        wrapper.vm.students = students
        await wrapper.vm.$nextTick()
        expect(wrapper.vm.filteredStudents.length).toBe(5)
    })
    it('clears success message after 3 seconds', async () => {
        vi.useFakeTimers();
        wrapper.vm.selectedStudent = { _id: '1', name: 'John Doe' };
        wrapper.vm.selectedIndividualCourse = '101';
        wrapper.vm.allCourses = [{ _id: '101', displayText: 'Test Course' }];
        await wrapper.vm.handleAddCourse();
        expect(wrapper.vm.successMessage).not.toBe('');
        vi.advanceTimersByTime(3000);
        expect(wrapper.vm.successMessage).toBe('');
        vi.useRealTimers();
    });

    it('can add course successfully to student', async () => {
        wrapper.vm.selectedStudent = { _id: '1', name: 'John Doe' }
        wrapper.vm.selectedIndividualCourse = '101'
        wrapper.vm.allCourses = [{ _id: '101', displayText: 'Test Course (TC101)' }]
        await wrapper.vm.handleAddCourse()
        expect(client.post).toHaveBeenCalledWith(
            '/student/1/addcourse',
            { courseId: '101' }
        )
        expect(wrapper.vm.successMessage).toContain('John Doe has been enrolled')
    })

    it('fetches courses when a program is selected', async () => {
        client.get.mockImplementation((url) => {
            if (url.includes('/program/1/courses')) {
                return Promise.resolve({
                    data: [
                        {
                            _id: '202',
                            courseName: 'Selected Course',
                            courseCode: 'SC202',
                        },
                    ],
                })
            }
            return Promise.resolve({ data: [] })
        })

        wrapper.vm.selectedProgram = '1'
        await wrapper.vm.fetchAllCourses()

        expect(wrapper.vm.allCourses[0]).toMatchObject({
            _id: '202',
            displayText: 'Selected Course (SC202)',
        })
    })

    it('alerts when course data is invalid', async () => {
        mockToast.error.mockClear()

        client.get.mockImplementation((url) => {
            if (url.includes('/program/1/courses')) {
                return Promise.resolve({ data: null })
            }
            return Promise.resolve({ data: [] })
        })

        wrapper.vm.selectedProgram = '1'
        await wrapper.vm.fetchAllCourses()

        expect(mockToast.error).toHaveBeenCalledWith('Invalid course data received.')
    })

    it('filters students when search query is present', async () => {
        wrapper.vm.students = [
            { name: 'Alpha' },
            { name: 'Beta' },
            { name: 'Gamma' },
        ]
        wrapper.vm.searchQuery = 'be'
        await wrapper.vm.$nextTick()

        expect(wrapper.vm.filteredStudents).toHaveLength(1)
        expect(wrapper.vm.filteredStudents[0].name).toBe('Beta')
    })
})
