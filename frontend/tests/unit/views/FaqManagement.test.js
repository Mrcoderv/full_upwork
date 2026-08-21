import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import FaqManagement from '@/views/Admin/FaqManagement.vue'

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

const storeState = { isAdmin: true, userId: 'admin-1' }

vi.mock('vuex', () => ({
    useStore: () => ({ getters: storeState }),
}))

import client from '@/api/client.js'

let vuetify

const category = { _id: 'cat-1', name: 'Avgifter', description: 'Betalning', status: 'active', displayOrder: 0 }
const inactiveCategory = { _id: 'cat-2', name: 'Dold', description: '', status: 'inactive', displayOrder: 1 }

const faq = {
    _id: 'faq-1',
    categoryId: category,
    question: 'Hur betalar jag min avgift?',
    answer: 'Via faktura den 25:e.',
    keywords: ['avgift'],
    alternateQuestions: [],
    status: 'active',
    displayOrder: 0,
    createdBy: { _id: 'admin-1', name: 'Admin' },
    updatedBy: { _id: 'admin-1', name: 'Admin' },
    updatedAt: '2026-01-01T10:00:00Z',
}

const mockGets = () => {
    client.get.mockImplementation((url) => {
        if (url === '/chatbot/faq/manage/categories') {
            return Promise.resolve({ data: { categories: [category, inactiveCategory] } })
        }
        if (url === '/chatbot/faq/manage/questions') {
            return Promise.resolve({ data: { faqs: [faq], total: 1, page: 1, limit: 10, totalPages: 1 } })
        }
        return Promise.resolve({ data: {} })
    })
}

const mountView = async () => {
    const wrapper = mount(FaqManagement, {
        global: { plugins: [vuetify] },
    })
    await flush()
    return wrapper
}

const flush = async () => {
    await new Promise((r) => setTimeout(r, 0))
}

describe('FaqManagement.vue', () => {
    beforeEach(async () => {
        const { createVuetify } = await import('vuetify')
        const components = await import('vuetify/components')
        const directives = await import('vuetify/directives')
        vuetify = createVuetify({ components, directives })

        vi.clearAllMocks()
        storeState.isAdmin = true
        storeState.userId = 'admin-1'
        mockGets()
    })

    it('renders FAQ rows with question and category', async () => {
        const wrapper = await mountView()
        expect(wrapper.text()).toContain('Hur betalar jag min avgift?')
        expect(wrapper.text()).toContain('Avgifter')
    })

    it('shows the categories tab for admins', async () => {
        const wrapper = await mountView()
        expect(wrapper.text()).toContain('Kategorier')
    })

    it('shows the categories tab for teachers without edit actions', async () => {
        storeState.isAdmin = false
        storeState.userId = 'teacher-1'
        const wrapper = await mountView()
        expect(wrapper.text()).toContain('Kategorier')
        expect(wrapper.text()).not.toContain('Redigera')
        expect(wrapper.text()).not.toContain('Ta bort')
    })

    it('sends search, category and status filters as query params', async () => {
        const wrapper = await mountView()
        wrapper.vm.faqSearch = 'avgift'
        wrapper.vm.faqCategoryFilter = 'cat-1'
        wrapper.vm.faqStatusFilter = 'inactive'
        await wrapper.vm.applyFaqFilters()
        expect(client.get).toHaveBeenCalledWith(
            '/chatbot/faq/manage/questions',
            expect.objectContaining({
                params: expect.objectContaining({
                    page: 1,
                    search: 'avgift',
                    categoryId: 'cat-1',
                    status: 'inactive',
                }),
            })
        )
    })

    it('filters by own user when onlyMine is checked (teacher)', async () => {
        storeState.isAdmin = false
        const wrapper = await mountView()
        wrapper.vm.onlyMine = true
        await flush()
        expect(client.get).toHaveBeenCalledWith(
            '/chatbot/faq/manage/questions',
            expect.objectContaining({
                params: expect.objectContaining({ createdBy: 'admin-1' }),
            })
        )
    })

    it('posts a create request with a valid payload', async () => {
        client.post.mockResolvedValue({ data: { faq: {} } })
        const wrapper = await mountView()
        await wrapper.vm.openCreateFaq()
        wrapper.vm.faqForm.categoryId = 'cat-1'
        wrapper.vm.faqForm.question = 'Ny fråga om betalning?'
        wrapper.vm.faqForm.answer = 'Nytt verifierat svar.'
        await wrapper.vm.saveFaq()
        expect(client.post).toHaveBeenCalledWith(
            '/chatbot/faq/manage/questions',
            expect.objectContaining({
                categoryId: 'cat-1',
                question: 'Ny fråga om betalning?',
                answer: 'Nytt verifierat svar.',
                status: 'active',
            })
        )
    })

    it('does not submit when question or category are missing', async () => {
        const wrapper = await mountView()
        await wrapper.vm.openCreateFaq()
        wrapper.vm.faqForm.question = '   '
        await wrapper.vm.saveFaq()
        expect(client.post).not.toHaveBeenCalled()
        expect(wrapper.vm.fieldErrors.categoryId).toBeTruthy()
        expect(wrapper.vm.fieldErrors.question).toBeTruthy()
    })

    it('updates an existing FAQ via PUT', async () => {
        client.put.mockResolvedValue({ data: { faq: {} } })
        const wrapper = await mountView()
        await wrapper.vm.openEditFaq(faq)
        wrapper.vm.faqForm.answer = 'Uppdaterat svar.'
        await wrapper.vm.saveFaq()
        expect(client.put).toHaveBeenCalledWith(
            '/chatbot/faq/manage/questions/faq-1',
            expect.objectContaining({ answer: 'Uppdaterat svar.' })
        )
    })

    it('toggles FAQ status through PUT with only status in payload', async () => {
        client.put.mockResolvedValue({ data: { faq: {} } })
        const wrapper = await mountView()
        await wrapper.vm.toggleFaqStatus(faq)
        expect(client.put).toHaveBeenCalledWith('/chatbot/faq/manage/questions/faq-1', { status: 'inactive' })
    })

    it('deletes an FAQ after confirmation', async () => {
        client.delete.mockResolvedValue({ data: { success: true } })
        const wrapper = await mountView()
        wrapper.vm.confirmDeleteFaq(faq)
        await wrapper.vm.runConfirmedAction()
        expect(client.delete).toHaveBeenCalledWith('/chatbot/faq/manage/questions/faq-1')
    })

    it('creates a category for admins', async () => {
        client.post.mockResolvedValue({ data: { category: {} } })
        const wrapper = await mountView()
        await wrapper.vm.openCreateCategory()
        wrapper.vm.categoryForm.name = 'Examination'
        await wrapper.vm.saveCategory()
        expect(client.post).toHaveBeenCalledWith(
            '/chatbot/faq/manage/categories',
            expect.objectContaining({ name: 'Examination', status: 'active' })
        )
    })

    it('creates a category as a teacher with default status', async () => {
        storeState.isAdmin = false
        client.post.mockResolvedValue({ data: { category: {} } })
        const wrapper = await mountView()
        await wrapper.vm.openCreateCategory()
        wrapper.vm.categoryForm.name = 'Lärarkategori'
        await wrapper.vm.saveCategory()
        expect(client.post).toHaveBeenCalledWith(
            '/chatbot/faq/manage/categories',
            expect.objectContaining({ name: 'Lärarkategori', status: 'active' })
        )
    })

    it('blocks category save without a name', async () => {
        const wrapper = await mountView()
        await wrapper.vm.openCreateCategory()
        await wrapper.vm.saveCategory()
        expect(client.post).not.toHaveBeenCalled()
        expect(wrapper.vm.fieldErrors.name).toBeTruthy()
    })

    it('shows an error state when loading fails', async () => {
        client.get.mockRejectedValue(Object.assign(new Error('Kunde inte hämta vanliga frågor.')))
        const wrapper = await mountView()
        expect(wrapper.vm.error).toMatch(/Kunde inte hämta/)
    })

    it('shows empty state when no FAQs exist', async () => {
        client.get.mockImplementation((url) => {
            if (url === '/chatbot/faq/manage/categories') {
                return Promise.resolve({ data: { categories: [] } })
            }
            if (url === '/chatbot/faq/manage/questions') {
                return Promise.resolve({ data: { faqs: [], total: 0, page: 1, limit: 10, totalPages: 1 } })
            }
            return Promise.resolve({ data: {} })
        })
        const wrapper = await mountView()
        expect(wrapper.text()).toContain('Inga vanliga frågor hittades')
    })
})
