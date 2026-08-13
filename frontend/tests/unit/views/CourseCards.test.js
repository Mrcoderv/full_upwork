import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import CourseCards from '@/views/Student/CourseCards.vue'

vi.mock('@/api/client.js', () => ({
    default: {
        get: vi.fn(),
        interceptors: {
            request: { use: vi.fn() },
            response: { use: vi.fn() },
        },
    },
}))

import client from '@/api/client.js'

let vuetify

const sampleCard = {
    courseInstanceId: '111111111111111111111111',
    enrollmentId: 'enrA',
    courseName: 'Svenska 1',
    courseCode: 'SVEENG01',
    coursePoints: '100',
    courseExtent: '5',
    responsibleTeacher: 'Mirsada',
    startDate: '2026-01-05T00:00:00.000Z',
    endDate: '2026-02-09T00:00:00.000Z',
    weeks: 5,
    studyPeriod: 1,
    status: 'active',
    isCurrentlyActive: true,
    modules: [
        {
            moduleNumber: 3,
            title: 'Delprov',
            isPartialExam: true,
            isCaseStudy: false,
            sections: [{ title: 'Sektion 1', description: 'Innehåll' }],
        },
    ],
}

const mountView = async (options = {}) => {
    const wrapper = mount(CourseCards, {
        global: { plugins: [vuetify] },
        ...options,
    })
    await flushPromises()
    return wrapper
}

describe('CourseCards.vue', () => {
    beforeEach(async () => {
        const { createVuetify } = await import('vuetify')
        const components = await import('vuetify/components')
        const directives = await import('vuetify/directives')
        vuetify = createVuetify({ components, directives })

        vi.clearAllMocks()
        client.get.mockResolvedValue({
            data: {
                student: { _id: '000000000000000000000001', name: 'Anna Andersson' },
                cards: [sampleCard],
            },
        })
    })

    it('renders the student name and course card fields', async () => {
        const wrapper = await mountView()
        expect(wrapper.text()).toContain('Mina kurser')
        expect(wrapper.text()).toContain('Anna Andersson')
        expect(wrapper.text()).toContain('Svenska 1')
        expect(wrapper.text()).toContain('SVEENG01')
        expect(wrapper.text()).toContain('Period 1')
        expect(wrapper.text()).toContain('Veckor: 5')
        expect(wrapper.text()).toContain('Pågående')
        expect(wrapper.text()).toContain('Mirsada')
        expect(wrapper.text()).toContain('Delprov')
        expect(client.get).toHaveBeenCalledWith('/course-cards/mine')
        wrapper.unmount()
    })

    it('shows the active/ongoing counter', async () => {
        const wrapper = await mountView()
        expect(wrapper.text()).toContain('1')
        expect(wrapper.text()).toContain('pågående')
        wrapper.unmount()
    })

    it('shows the empty state when there are no cards', async () => {
        client.get.mockResolvedValue({
            data: { student: null, cards: [] },
        })
        const wrapper = await mountView()
        expect(wrapper.text()).toContain('Inga kurser ännu')
        wrapper.unmount()
    })

    it('shows the backend error message on failure', async () => {
        client.get.mockRejectedValue({
            response: { data: { error: 'Konto saknar e-postadress' } },
        })
        const wrapper = await mountView()
        expect(wrapper.text()).toContain('Konto saknar e-postadress')
        wrapper.unmount()
    })

    it('falls back to a generic message when the error has no payload', async () => {
        client.get.mockRejectedValue(new Error('network'))
        const wrapper = await mountView()
        expect(wrapper.text()).toContain('Kunde inte hämta kurserna.')
        wrapper.unmount()
    })
})
