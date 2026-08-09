import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import GradingScaleAdmin from '../../src/views/Admin/GradingScaleAdmin.vue'

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

const scaleFixture = (overrides = {}) => ({
    _id: 'scale-1',
    term: 'HT24',
    subject: 'Matematik',
    scale: [
        { min: 90, grade: 'A' },
        { min: 75, grade: 'B' },
        { min: 60, grade: 'C' },
        { min: 45, grade: 'D' },
        { min: 30, grade: 'E' },
    ],
    ...overrides,
})

describe('GradingScaleAdmin.vue - Betygsskalor', () => {
    let wrapper

    const mountPage = async ({ scales = [], terms = [] } = {}) => {
        client.get.mockImplementation((url) => {
            if (url === '/grading-scale') return Promise.resolve({ data: scales })
            if (url === '/grading-scale/terms') return Promise.resolve({ data: terms })
            return Promise.reject(new Error(`404 Not Found: ${url}`))
        })
        wrapper = mount(GradingScaleAdmin)
        await wrapper.vm.$nextTick()
        await new Promise((r) => setTimeout(r, 0))
        await wrapper.vm.$nextTick()
    }

    beforeEach(() => {
        vi.resetAllMocks()
    })

    it('lists existing grading scales with threshold chips', async () => {
        await mountPage({ scales: [scaleFixture()], terms: ['HT24'] })

        expect(wrapper.text()).toContain('HT24')
        expect(wrapper.text()).toContain('Matematik')
        expect(wrapper.text()).toContain('A ≥ 90')
        expect(wrapper.text()).toContain('E ≥ 30')
    })

    it('shows an empty state when no scales exist', async () => {
        await mountPage({ scales: [], terms: [] })

        expect(wrapper.text()).toContain('Inga betygsskalor ännu')
    })

    it('creates a new scale', async () => {
        await mountPage({ scales: [], terms: ['HT24'] })
        client.post.mockResolvedValue({ data: { _id: 'scale-new' } })

        wrapper.vm.form.term = 'HT24'
        wrapper.vm.form.subject = 'Engelska'
        wrapper.vm.form.thresholds = { A: 90, B: 75, C: 60, D: 45, E: 30 }

        expect(wrapper.vm.canSave()).toBe(true)
        await wrapper.vm.saveScale()

        expect(client.post).toHaveBeenCalledWith('/grading-scale', {
            term: 'HT24',
            subject: 'Engelska',
            scale: [
                { grade: 'A', min: 90 },
                { grade: 'B', min: 75 },
                { grade: 'C', min: 60 },
                { grade: 'D', min: 45 },
                { grade: 'E', min: 30 },
            ],
        })
    })

    it('rejects a payload without a valid term', () => {
        wrapper = mount(GradingScaleAdmin)
        wrapper.vm.form.term = '2024'
        wrapper.vm.form.subject = 'Matematik'
        wrapper.vm.form.thresholds = { A: 90 }

        expect(wrapper.vm.canSave()).toBe(false)
    })

    it('updates an existing scale', async () => {
        await mountPage({ scales: [scaleFixture()], terms: ['HT24'] })
        client.put.mockResolvedValue({ data: { _id: 'scale-1' } })

        wrapper.vm.openEditDialog(scaleFixture())
        wrapper.vm.form.thresholds.A = 95
        await wrapper.vm.saveScale()

        expect(client.put).toHaveBeenCalledWith(
            '/grading-scale/scale-1',
            expect.objectContaining({
                term: 'HT24',
                subject: 'Matematik',
                scale: expect.arrayContaining([{ grade: 'A', min: 95 }]),
            })
        )
    })

    it('deletes a scale after confirmation', async () => {
        await mountPage({ scales: [scaleFixture()], terms: ['HT24'] })
        client.delete.mockResolvedValue({ data: { success: true } })

        await wrapper.vm.confirmDelete(scaleFixture())

        expect(client.delete).toHaveBeenCalledWith('/grading-scale/scale-1')
    })
})
