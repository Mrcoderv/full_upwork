import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import Submissions from '@/views/Teacher/Submissions.vue'

vi.mock('@/api/client.js', () => ({
    default: {
        get: vi.fn(),
        put: vi.fn(),
        interceptors: {
            request: { use: vi.fn() },
            response: { use: vi.fn() },
        },
    },
}))

import client from '@/api/client.js'

let vuetify

const sampleSubmission = {
    _id: 'sub-1',
    studentId: { _id: 'stu-1', name: 'Elin Ek', email: 'elin@example.com' },
    courseInstanceId: { _id: 'inst-1', courseName: 'Svenska 1', courseCode: 'SVEENG01' },
    moduleNumber: 2,
    submittedText: 'Min reflektion om texten.',
    submittedAt: '2026-08-13T10:00:00.000Z',
    feedback: { status: '', comment: '' },
}

const mountView = async (options = {}) => {
    const wrapper = mount(Submissions, {
        global: { plugins: [vuetify] },
        ...options,
    })
    await flushPromises()
    return wrapper
}

describe('Submissions.vue', () => {
    beforeEach(async () => {
        const { createVuetify } = await import('vuetify')
        const components = await import('vuetify/components')
        const directives = await import('vuetify/directives')
        vuetify = createVuetify({ components, directives })

        vi.clearAllMocks()
        client.get.mockResolvedValue({
            data: { submissions: [sampleSubmission] },
        })
        client.put.mockResolvedValue({
            data: { submission: { ...sampleSubmission, feedback: { status: 'godkänd', comment: 'Bra!' } } },
        })
    })

    it('renders pending submissions with student and course info', async () => {
        const wrapper = await mountView()
        expect(wrapper.text()).toContain('Elin Ek')
        expect(wrapper.text()).toContain('Svenska 1 (SVEENG01)')
        expect(wrapper.text()).toContain('Modul 2')
        expect(wrapper.text()).toContain('Min reflektion om texten.')
        expect(client.get).toHaveBeenCalledWith('/learning/submissions/pending')
        wrapper.unmount()
    })

    it('filters submissions by course', async () => {
        const other = {
            ...sampleSubmission,
            _id: 'sub-2',
            courseInstanceId: { _id: 'inst-2', courseName: 'Matte', courseCode: 'MATMAT01' },
        }
        client.get.mockResolvedValue({ data: { submissions: [sampleSubmission, other] } })
        const wrapper = await mountView()
        expect(wrapper.find('select#course-filter').exists()).toBe(true)
        expect(wrapper.findAll('article.submission-card')).toHaveLength(2)
        await wrapper.find('select#course-filter').setValue('inst-2')
        expect(wrapper.findAll('article.submission-card')).toHaveLength(1)
        expect(wrapper.text()).toContain('Matte (MATMAT01)')
        wrapper.unmount()
    })

    it('shows the empty state when there are no pending submissions', async () => {
        client.get.mockResolvedValue({ data: { submissions: [] } })
        const wrapper = await mountView()
        expect(wrapper.text()).toContain('Inga väntande inlämningar just nu.')
        wrapper.unmount()
    })

    it('saves feedback and removes the submission from the list', async () => {
        const wrapper = await mountView()
        await wrapper.find('select.status-select').setValue('godkänd')
        await wrapper.find('textarea.feedback-comment-input').setValue('Bra jobbat!')
        await wrapper.find('button.save-btn').trigger('click')
        await flushPromises()
        expect(client.put).toHaveBeenCalledWith('/learning/submissions/sub-1/feedback', {
            comment: 'Bra jobbat!',
            status: 'godkänd',
        })
        expect(wrapper.text()).toContain('Inga väntande inlämningar just nu.')
        wrapper.unmount()
    })

    it('requires a status before saving feedback', async () => {
        const wrapper = await mountView()
        await wrapper.find('textarea.feedback-comment-input').setValue('Bara en kommentar')
        await wrapper.find('button.save-btn').trigger('click')
        await flushPromises()
        expect(client.put).not.toHaveBeenCalled()
        expect(wrapper.text()).toContain('Välj en status')
        wrapper.unmount()
    })
})
