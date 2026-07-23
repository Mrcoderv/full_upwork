import { mount } from '@vue/test-utils'
import axios from 'axios'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createStore } from 'vuex'
import { api } from '../../src/store/store.js'
import ExcelUpload from '../../src/views/Admin/ExcelUpload.vue'

vi.mock('axios', () => {
    const axiosMock = {
        get: vi.fn((url) => {
            if (url.includes('/api/students')) {
                return Promise.resolve({
                    data: [
                        {
                            _id: '1',
                            name: 'John Doe',
                            personalNumber: '123456789',
                            email: 'john@example.com',
                        },
                    ],
                });
            }
            if (url.includes('/api/all-programs')) {
                return Promise.resolve({ data: [] });
            }
            if (url.includes('/api/all-course-packages')) {
                return Promise.resolve({ data: [] });
            }
            if (url.includes('/api/all-courses')) {
                return Promise.resolve({ data: [] });
            }
            return Promise.reject(new Error(`404 Not Found: ${url}`));
        }),
        post: vi.fn(() => Promise.resolve({ data: 'Success' })),
        put: vi.fn(() => Promise.resolve({ data: 'Success' })),
        delete: vi.fn(() => Promise.resolve({ data: 'Success' })),
        interceptors: {
            request: { use: vi.fn() },
            response: { use: vi.fn() }
        }
    };
    axiosMock.create = vi.fn(() => axiosMock);
    return {
        default: axiosMock,
    };
});


describe('ExcelUpload.vue', () => {
    let wrapper;
    let vuetify;
    let store;

    beforeEach(async () => {
        vi.clearAllMocks();
        store = createStore({
            state: {
                user: { name: 'Test User' },
            },
            getters: {
                isSystemAdmin: () => true,
            }
        });
        wrapper = mount(ExcelUpload, {
            global: {
                plugins: [vuetify, store],
            },
        });
        await wrapper.vm.$nextTick();
    });

    it('filters students based on search query', async () => {
        wrapper.vm.students = [
            { name: 'Alice' },
            { name: 'Bob' },
            { name: 'Charlie' },
        ];
        await wrapper.vm.$nextTick();

        wrapper.vm.searchQuery = 'b';
        await wrapper.vm.$nextTick();

        expect(wrapper.vm.filteredStudents.length).toBe(1);
    });

    it('shows and hides flash messages', async () => {
        vi.useFakeTimers();
        wrapper.vm.showFlashMessage('success', 'Test message', 1000);
        expect(wrapper.vm.flashMessage.show).toBe(true);
        expect(wrapper.vm.flashMessage.type).toBe('success');
        expect(wrapper.vm.flashMessage.message).toBe('Test message');

        vi.advanceTimersByTime(1000);
        expect(wrapper.vm.flashMessage.show).toBe(false);
    });
    it('returns correct education label', () => {
        let edu = { name: 'Test Course' };
        expect(wrapper.vm.getEducationLabel(edu)).toBe('Test Course');

        edu = { type: 'Course', refId: { courseName: 'Science' } };
        expect(wrapper.vm.getEducationLabel(edu)).toBe('Science');

        edu = { type: 'CoursePackage', refId: { coursePackageName: 'Package A' } };
        expect(wrapper.vm.getEducationLabel(edu)).toBe('CoursePackage: Package A');

        edu = { type: 'Program', refId: { programName: 'Program B' } };
        expect(wrapper.vm.getEducationLabel(edu)).toBe('Program B');

        edu = { refId: null };
        expect(wrapper.vm.getEducationLabel(edu)).toBe('(missing)');

        edu = { type: 'Invalid', refId: {} };
        expect(wrapper.vm.getEducationLabel(edu)).toBe('(invalid type)');
    });
    it('formats comments correctly', () => {
        let comment = 'Hello\nWorld';
        expect(wrapper.vm.formatComment(comment)).toBe('Hello<br />World');

        comment = 'No newlines';
        expect(wrapper.vm.formatComment(comment)).toBe('No newlines');

        comment = null;
        expect(wrapper.vm.formatComment(comment)).toBe('');
    });
    it('toggles expanded comments', () => {
        wrapper.vm.expandedComments = [];
        wrapper.vm.toggleComment(1);
        expect(wrapper.vm.expandedComments).toContain(1);
        wrapper.vm.toggleComment(1);
        expect(wrapper.vm.expandedComments).not.toContain(1);
    });
    it('saves grade for a course', async () => {
        await wrapper.vm.saveGrade('student1', 'course1', 'A');
        expect(axios.put).toHaveBeenCalledWith(
            `${import.meta.env.VITE_API_URL}/api/student/student1/education/course1/grade`,
            { grade: 'A' }
        );
    });

    it('marks education entry for removal when confirmed', () => {
        const originalConfirm = globalThis.confirm;
        globalThis.confirm = vi.fn(() => true);
        const showInfoSpy = vi.spyOn(wrapper.vm, 'showInfo').mockImplementation(() => { });
        wrapper.vm.editingStudent = { education: [{ name: 'Math 101' }] };

        wrapper.vm.confirmRemoveEducation(0);

        expect(wrapper.vm.editingStudent.education[0].removedAt).toBeTruthy();
        expect(showInfoSpy).toHaveBeenCalled();

        showInfoSpy.mockRestore();
        globalThis.confirm = originalConfirm;
    });

    it('updates education selection and entry data', () => {
        wrapper.vm.editingStudent = { education: [{ type: 'Old', name: 'Old', refId: 'old' }] };
        wrapper.vm.educationSelections = [{ type: 'Old', name: 'Old', refId: 'old' }];

        wrapper.vm.updateEducationSelection({ type: 'Course', name: 'New', refId: 'new' }, 0);

        expect(wrapper.vm.editingStudent.education[0]).toMatchObject({
            type: 'Course',
            name: 'New',
            refId: 'new',
        });

        wrapper.vm.updateEducationEntry({ type: 'CoursePackage', name: 'Package', refId: 'pkg' }, 0);
        expect(wrapper.vm.educationSelections[0]).toEqual({ type: 'CoursePackage', name: 'Package', refId: 'pkg' });
    });

    it('warns when final exam date inputs are missing', () => {
        const showWarningSpy = vi.spyOn(wrapper.vm, 'showWarning').mockImplementation(() => { });
        wrapper.vm.finalExamDate = { date: '', time: '' };

        wrapper.vm.applyFinalExamDate();

        expect(showWarningSpy).toHaveBeenCalledWith('Vänligen välj både datum och tid för slutprov.');
        showWarningSpy.mockRestore();
    });

    it('shows error for invalid final exam date', () => {
        const showErrorSpy = vi.spyOn(wrapper.vm, 'showError').mockImplementation(() => { });
        wrapper.vm.finalExamDate = { date: 'invalid-date', time: '10:00' };
        wrapper.vm.editingStudent = {};

        wrapper.vm.applyFinalExamDate();

        expect(showErrorSpy).toHaveBeenCalledWith('❌ Ogiltigt datum.');
        showErrorSpy.mockRestore();
    });

    it('shows error when final exam time is invalid', () => {
        const showErrorSpy = vi.spyOn(wrapper.vm, 'showError').mockImplementation(() => { });
        wrapper.vm.finalExamDate = { date: '2024-12-01', time: 'invalid-time' };
        wrapper.vm.editingStudent = {};

        wrapper.vm.applyFinalExamDate();

        expect(showErrorSpy).toHaveBeenCalledWith('❌ Ogiltigt kombinerat datum/tid.');
        showErrorSpy.mockRestore();
    });

    it('sets final exam date when inputs are valid', () => {
        wrapper.vm.editingStudent = {};
        wrapper.vm.finalExamDate = { date: '2024-12-01', time: '10:00' };
        wrapper.vm.formattedFinalExamDate = '';
        wrapper.vm.showFinalExamPicker = true;

        wrapper.vm.applyFinalExamDate();

        const expectedTimestamp = new Date('2024-12-01T10:00').getTime();
        expect(new Date(wrapper.vm.editingStudent.finalExamDate).getTime()).toBe(expectedTimestamp);
        expect(wrapper.vm.formattedFinalExamDate).toBe('2024-12-01 10:00');
        expect(wrapper.vm.showFinalExamPicker).toBe(false);
    });

    it('normalizes student data when opening edit dialog', () => {
        const student = {
            _id: 'edit-1',
            name: 'Editable',
            municipality: 'Townsville',
            startDate: '2024-01-01',
            endDate: '2024-02-01',
            finalExamDate: '2024-03-01T09:00:00Z',
            education: [
                {
                    type: 'Course',
                    startDate: '2024-01-05',
                    endDate: '2024-01-20',
                    finalExamDate: '2024-01-25T12:00:00Z',
                    refId: { _id: 'edu-1', courseName: 'Science' },
                },
            ],
        };

        wrapper.vm.openEditStudent(student);

        expect(wrapper.vm.editingStudentDialog).toBe(true);
        expect(wrapper.vm.editingStudent.municipality.type).toBe('Townsville');
        expect(wrapper.vm.educationSelections[0]).toEqual({
            type: 'Course',
            name: 'Science',
            refId: 'edu-1',
        });
    });

    it('saves edited student and updates local list', async () => {
        wrapper.vm.editingStudent = {
            _id: 'student-1',
            startDate: '2024-01-01',
            endDate: '2024-02-01',
            finalExamDate: '2024-03-01',
            education: [],
        };
        wrapper.vm.students = [{ _id: 'student-1', name: 'Original' }];
        axios.put.mockResolvedValue({ data: { _id: 'student-1', name: 'Updated' } });
        const showSuccessSpy = vi.spyOn(wrapper.vm, 'showSuccess').mockImplementation(() => { });

        await wrapper.vm.saveEditedStudent();

        expect(wrapper.vm.students[0].name).toBe('Updated');
        expect(wrapper.vm.editingStudentDialog).toBe(false);
        expect(showSuccessSpy).toHaveBeenCalled();
        showSuccessSpy.mockRestore();
    });

    it('shows error when saving edited student fails', async () => {
        wrapper.vm.editingStudent = {
            _id: 'student-2',
            education: [],
        };
        const showErrorSpy = vi.spyOn(wrapper.vm, 'showError').mockImplementation(() => { });
        axios.put.mockRejectedValue(new Error('boom'));

        await wrapper.vm.saveEditedStudent();

        expect(showErrorSpy).toHaveBeenCalledWith(
            '❌ Kunde inte spara studenten. Kontrollera att alla obligatoriska fält är ifyllda.'
        );
        showErrorSpy.mockRestore();
    });

    it('adds a new education entry when confirmed', () => {
        wrapper.vm.editingStudent = { education: [] };
        wrapper.vm.selectedEducation = { type: 'Course', name: 'New Course', refId: 'course-1' };
        const showSuccessSpy = vi.spyOn(wrapper.vm, 'showSuccess').mockImplementation(() => { });

        wrapper.vm.confirmAddEducation();

        expect(wrapper.vm.editingStudent.education).toHaveLength(1);
        expect(wrapper.vm.educationSelections).toHaveLength(1);
        expect(wrapper.vm.selectedEducation).toBeNull();
        expect(wrapper.vm.showEducationSelector).toBe(false);
        expect(showSuccessSpy).toHaveBeenCalled();

        showSuccessSpy.mockRestore();
    });

    it('resets editing state when cancelling', () => {
        wrapper.vm.editingStudentDialog = true;
        wrapper.vm.editingStudent = { name: 'Temp' };
        wrapper.vm.selectedEducation = { type: 'Course' };
        wrapper.vm.educationSelections = [{ type: 'Old' }];
        wrapper.vm.finalExamDate = { date: '2024-01-01', time: '10:00' };
        wrapper.vm.formattedFinalExamDate = '2024-01-01 10:00';
        wrapper.vm.showGradeIndex = 1;

        wrapper.vm.cancelEdit();

        expect(wrapper.vm.editingStudentDialog).toBe(false);
        expect(wrapper.vm.editingStudent).toBeNull();
        expect(wrapper.vm.selectedEducation).toBeNull();
        expect(wrapper.vm.educationSelections).toEqual([]);
        expect(wrapper.vm.formattedFinalExamDate).toBe('');
        expect(wrapper.vm.showGradeIndex).toBeNull();
    });

    it('marks education removed when removeEducation is called', () => {
        wrapper.vm.editingStudent = { education: [{ name: 'Course A' }] };

        wrapper.vm.removeEducation(0);

        expect(wrapper.vm.editingStudent.education[0].removedAt).toBeDefined();
    });

    it('stores uploaded file data', () => {
        const fakeFile = { name: 'students.xlsx' };

        wrapper.vm.handleFileUpload({ target: { files: [fakeFile] } });

        expect(wrapper.vm.selectedFileName).toBe('students.xlsx');
        expect(wrapper.vm.file).toStrictEqual(fakeFile);
    });

    it('warns when uploadFile is called without a file', async () => {
        const showWarningSpy = vi.spyOn(wrapper.vm, 'showWarning').mockImplementation(() => { });
        wrapper.vm.file = null;

        await wrapper.vm.uploadFile();

        expect(showWarningSpy).toHaveBeenCalledWith('Vänligen välj en Excel-fil att ladda upp.');
        showWarningSpy.mockRestore();
    });

    it('shows detailed error when uploadFile fails with reasons', async () => {
        const showErrorSpy = vi.spyOn(wrapper.vm, 'showError').mockImplementation(() => { });
        wrapper.vm.file = { name: 'students.xlsx' };
        api.post.mockRejectedValue({
            response: {
                status: 422,
                data: { reasons: [{ student: '123', message: 'Missing' }] },
            },
        });

        await wrapper.vm.uploadFile();

        expect(showErrorSpy).toHaveBeenCalled();
        expect(wrapper.vm.file).toBeNull();
        showErrorSpy.mockRestore();
    });

    it('shows error when fetchStudents fails', async () => {
        const showErrorSpy = vi.spyOn(wrapper.vm, 'showError').mockImplementation(() => { });
        axios.get.mockRejectedValueOnce({ response: { data: 'boom' } });

        await wrapper.vm.fetchStudents();

        expect(showErrorSpy).toHaveBeenCalledWith('❌ Kunde inte hämta elever.');
        showErrorSpy.mockRestore();
    });

    it('logs when loading education options fails', async () => {
        const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => { });
        axios.get.mockRejectedValueOnce(new Error('boom'));

        await wrapper.vm.fetchEducationOptions();

        expect(consoleErrorSpy).toHaveBeenCalledWith('❌ Failed to load education options:', expect.any(Error));
        consoleErrorSpy.mockRestore();
    });

    it('formats dates for display and inputs correctly', () => {
        expect(wrapper.vm.formatDate('2024-01-01T05:00:00')).toBe('2024-01-01');
        expect(wrapper.vm.formatDate('Simple string')).toBe('Simple string');
        expect(wrapper.vm.formatDate('')).toBe('');
        expect(wrapper.vm.formatDateForInput('2024-01-02T12:00:00')).toBe('2024-01-02'); // TODO: TZ from host
        expect(wrapper.vm.formatDateForInput('invalid')).toBe('');
        expect(wrapper.vm.formatDateTimeForInput('2024-01-02T10:15:00')).toMatch(/2024-01-02T10:15/);
        expect(wrapper.vm.formatDateTimeForInput('invalid')).toBe('');
    });

    it('shows the education selector when addEducation is triggered', () => {
        wrapper.vm.showEducationSelector = false;
        wrapper.vm.addEducation();
        expect(wrapper.vm.showEducationSelector).toBe(true);
    });

    it('uses flash helper wrappers to show alerts', () => {
        const flashSpy = vi.spyOn(wrapper.vm, 'showFlashMessage').mockImplementation(() => { });

        wrapper.vm.showSuccess('ok');
        wrapper.vm.showError('error');
        wrapper.vm.showWarning('warn');
        wrapper.vm.showInfo('info');

        expect(flashSpy).toHaveBeenCalledTimes(4);
        flashSpy.mockRestore();
    });

    it('uploads file successfully and resets UI', async () => {
        vi.useFakeTimers();
        wrapper.vm.file = { name: 'students.xlsx' };
        const fetchSpy = vi.spyOn(wrapper.vm, 'fetchStudents').mockImplementation(() => Promise.resolve());
        api.post.mockResolvedValue({ data: 'ok' });

        await wrapper.vm.uploadFile();

        expect(api.post).toHaveBeenCalledWith(
            'uploads/upload/xlsxupload',
            expect.any(Object),
            expect.objectContaining({
                headers: {
                    'Content-Type': 'multipart/form-data',
                },
            })
        );
        expect(wrapper.vm.uploadSuccess).toBe(true);
        vi.advanceTimersByTime(3000);
        expect(wrapper.vm.uploadSuccess).toBe(false);
        expect(wrapper.vm.file).toBeNull();
        expect(wrapper.vm.selectedFileName).toBe('');
        expect(fetchSpy).toHaveBeenCalled();
        vi.useRealTimers();
        fetchSpy.mockRestore();
    });

    it('shows warning when uploadFile returns 409', async () => {
        const showWarningSpy = vi.spyOn(wrapper.vm, 'showWarning').mockImplementation(() => { });
        wrapper.vm.file = { name: 'students.xlsx' };
        api.post.mockRejectedValue({ response: { status: 409 } });

        await wrapper.vm.uploadFile();

        expect(showWarningSpy).toHaveBeenCalledWith(
            '⚠️ Några elever fanns redan i systemet och lades inte till.'
        );
        showWarningSpy.mockRestore();
    });

    it('shows login error when uploadFile returns 401', async () => {
        const showErrorSpy = vi.spyOn(wrapper.vm, 'showError').mockImplementation(() => { });
        wrapper.vm.file = { name: 'students.xlsx' };
        api.post.mockRejectedValue({ response: { status: 401 } });

        await wrapper.vm.uploadFile();

        expect(showErrorSpy).toHaveBeenCalledWith('❌ Du är inte inloggad. Vänligen logga in igen.');
        showErrorSpy.mockRestore();
    });

    it('shows generic upload error for other failures', async () => {
        const showErrorSpy = vi.spyOn(wrapper.vm, 'showError').mockImplementation(() => { });
        wrapper.vm.file = { name: 'students.xlsx' };
        api.post.mockRejectedValue({ response: { status: 500 } });

        await wrapper.vm.uploadFile();

        expect(showErrorSpy).toHaveBeenCalledWith('❌ Kunde inte ladda upp elever.');
        showErrorSpy.mockRestore();
    });

    it('toggles dropout status when updateDropOut succeeds', async () => {
        wrapper.vm.students = [{ _id: 'drop', dropout: false }];
        axios.put.mockResolvedValue({ data: { _id: 'drop', dropout: true } });

        await wrapper.vm.updateDropOut(wrapper.vm.students[0]);

        expect(wrapper.vm.students[0].dropout).toBe(true);
    });

    it('deletes a student when deleteStudent succeeds', async () => {
        wrapper.vm.students = [{ _id: 'keep' }, { _id: 'remove' }];
        axios.delete.mockResolvedValue({});

        await wrapper.vm.deleteStudent('remove');

        expect(wrapper.vm.students).toHaveLength(1);
        expect(wrapper.vm.students[0]._id).toBe('keep');
    });

    it('deletes all students when deleteAllStudents succeeds', async () => {
        wrapper.vm.students = [{ _id: 'a' }];
        axios.delete.mockResolvedValue({});

        await wrapper.vm.deleteAllStudents();

        expect(wrapper.vm.students).toEqual([]);
    });

    it('fetches students with normalized defaults', async () => {
        axios.get.mockResolvedValueOnce({
            data: [{ _id: 'norm', municipality: null, education: null, courses: null }],
        });

        await wrapper.vm.fetchStudents();

        expect(wrapper.vm.students[0]).toEqual(
            expect.objectContaining({
                municipality: { type: '' },
                education: [],
                courses: [],
            })
        );
    });

    it('loads education options from all endpoints', async () => {
        const programs = [{ _id: 'p1', programName: 'Prog' }];
        const packages = [{ _id: 'pkg1', coursePackageName: 'Pack' }];
        const courses = [{ _id: 'c1', courseName: 'Course', courseCode: 'C01' }];

        axios.get
            .mockResolvedValueOnce({ data: programs })
            .mockResolvedValueOnce({ data: packages })
            .mockResolvedValueOnce({ data: courses });

        await wrapper.vm.fetchEducationOptions();

        expect(wrapper.vm.educationOptions).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ type: 'Program', refId: 'p1' }),
                expect.objectContaining({ type: 'CoursePackage', refId: 'pkg1' }),
                expect.objectContaining({ type: 'Course', refId: 'c1' }),
            ])
        );
    });

    it('returns course names safely', () => {
        expect(wrapper.vm.getCourseName({ courseId: { courseName: 'Name' } })).toBe('Name');
        expect(wrapper.vm.getCourseName({ courseId: {} })).toBe('Unnamed Course');
        expect(wrapper.vm.getCourseName(null)).toBe('No course data');
    });
});
