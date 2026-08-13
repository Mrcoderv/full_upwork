import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import CourseTemplates from '@/views/Admin/CourseTemplates.vue'

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

vi.mock('@/composables/useToast.js', () => ({
    useToast: () => ({
        success: vi.fn(),
        error: vi.fn(),
        warning: vi.fn(),
        info: vi.fn(),
    }),
}))

import client from '@/api/client.js'

let vuetify

const sampleTemplate = {
    _id: 'tpl-1',
    templateName: 'Engelska 5',
    courseId: { _id: 'course-1', courseName: 'Engelska 5', courseCode: 'ENGENG05' },
    modules: [
        { moduleNumber: 1, title: 'Modul 1', isPartialExam: false, isCaseStudy: false, sections: [{ title: 'Sektion 1', description: '' }, { title: 'Sektion 2', description: '' }] },
        { moduleNumber: 2, title: 'Modul 2', isPartialExam: false, isCaseStudy: false, sections: [{ title: 'Sektion 1', description: '' }, { title: 'Sektion 2', description: '' }] },
        { moduleNumber: 3, title: 'Delprov', isPartialExam: true, isCaseStudy: false, sections: [{ title: 'Sektion 1', description: '' }, { title: 'Sektion 2', description: '' }] },
        { moduleNumber: 4, title: 'Modul 4', isPartialExam: false, isCaseStudy: false, sections: [{ title: 'Sektion 1', description: '' }, { title: 'Sektion 2', description: '' }] },
        { moduleNumber: 5, title: 'Case Study', isPartialExam: false, isCaseStudy: true, sections: [{ title: 'Sektion 1', description: '' }, { title: 'Sektion 2', description: '' }] },
    ],
    isActive: true,
    createdBy: { username: 'Anna', email: 'anna@x' },
}

const mountView = async (options = {}) => {
    const wrapper = mount(CourseTemplates, {
        global: { plugins: [vuetify] },
        ...options,
    })
    await wrapper.vm.$nextTick()
    return wrapper
}

describe('CourseTemplates.vue', () => {
    beforeEach(async () => {
        const { createVuetify } = await import('vuetify')
        const components = await import('vuetify/components')
        const directives = await import('vuetify/directives')
        vuetify = createVuetify({ components, directives })

        vi.clearAllMocks()
        client.get.mockImplementation((url) => {
            if (url === '/course-templates') {
                return Promise.resolve({ data: { templates: [sampleTemplate] } })
            }
            if (url === '/courses') {
                return Promise.resolve({ data: [{ _id: 'course-1', courseName: 'Engelska 5', courseCode: 'ENGENG05' }] })
            }
            return Promise.resolve({ data: {} })
        })
    })

    it('renders template name', async () => {
        const wrapper = await mountView()
        expect(wrapper.text()).toContain('Engelska 5')
        wrapper.unmount()
    })

    it('shows the linked course code', async () => {
        const wrapper = await mountView()
        expect(wrapper.text()).toContain('ENGENG05')
        wrapper.unmount()
    })

    it('builds 5 modules with 2 sections by default when creating', async () => {
        client.post.mockResolvedValue({ data: { success: true, template: {} } })
        const wrapper = await mountView()
        await wrapper.vm.openCreate()
        await wrapper.vm.$nextTick()
        expect(wrapper.vm.form.modules).toHaveLength(5)
        expect(wrapper.vm.form.modules[0].sections).toHaveLength(2)
        expect(wrapper.vm.form.modules[2].isPartialExam).toBe(true)
        expect(wrapper.vm.form.modules[4].isCaseStudy).toBe(true)
        wrapper.unmount()
    })

    it('submits a create request with template name', async () => {
        client.post.mockResolvedValue({ data: { success: true, template: {} } })
        const wrapper = await mountView()
        await wrapper.vm.openCreate()
        wrapper.vm.form.templateName = 'Engelska 6'
        await wrapper.vm.save()
        await wrapper.vm.$nextTick()
        expect(client.post).toHaveBeenCalledWith('/course-templates', expect.objectContaining({ templateName: 'Engelska 6' }))
        wrapper.unmount()
    })

    it('does not submit when template name is empty', async () => {
        const wrapper = await mountView()
        await wrapper.vm.openCreate()
        await wrapper.vm.save()
        await wrapper.vm.$nextTick()
        expect(client.post).not.toHaveBeenCalled()
        wrapper.unmount()
    })
})
