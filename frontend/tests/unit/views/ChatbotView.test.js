import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ChatbotView from '@/views/Student/ChatbotView.vue'

vi.mock('@/api/client.js', () => ({
    default: {
        get: vi.fn(),
        post: vi.fn(),
        interceptors: {
            request: { use: vi.fn() },
            response: { use: vi.fn() },
        },
    },
}))

import client from '@/api/client.js'

const category = { _id: 'cat-1', name: 'Avgifter', description: 'Betalning och avgifter' }
const faqItem = {
    _id: 'faq-1',
    categoryId: 'cat-1',
    question: 'Hur betalar jag min avgift?',
    answer: 'EXAKT_VERIFIERAT_SVAR',
    keywords: ['avgift'],
}

const mountView = async () => {
    const wrapper = mount(ChatbotView)
    await new Promise((r) => setTimeout(r, 0))
    return wrapper
}

describe('ChatbotView.vue – FAQ integration', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        client.get.mockImplementation((url) => {
            if (url === '/chatbot/status') {
                return Promise.resolve({ data: { data: { status: 'available' } } })
            }
            if (url === '/chatbot/faq/categories') {
                return Promise.resolve({ data: { categories: [category] } })
            }
            if (url === `/chatbot/faq/categories/${category._id}/questions`) {
                return Promise.resolve({ data: { faqs: [faqItem], total: 1, page: 1, limit: 10, totalPages: 1 } })
            }
            return Promise.resolve({ data: {} })
        })
        client.post.mockResolvedValue({
            data: { data: { answer: 'AI-svar', sources: [], confidence: 0.8, approved: true } },
        })
    })

    it('renders the existing chatbot shell', async () => {
        const wrapper = await mountView()
        expect(wrapper.text()).toContain('Fråga din studieassistent')
        expect(wrapper.find('.composer').exists()).toBe(true)
        wrapper.unmount()
    })

    it('highlights FAQ categories instead of hardcoded suggestions', async () => {
        const wrapper = await mountView()
        await new Promise((r) => setTimeout(r, 0))
        expect(wrapper.find('.faq-suggestion').exists()).toBe(true)
        expect(wrapper.text()).toContain('Avgifter')
        expect(wrapper.text()).not.toContain('Hur kommer jag igång med min kurs?')
        wrapper.unmount()
    })

    it('opens the selected category questions from the home suggestions', async () => {
        const wrapper = await mountView()
        await new Promise((r) => setTimeout(r, 0))
        await wrapper.vm.openCategoryFromHome(category)
        await new Promise((r) => setTimeout(r, 0))
        expect(wrapper.vm.showFaqPanel).toBe(true)
        expect(wrapper.vm.selectedCategory?.name).toBe('Avgifter')
        expect(wrapper.vm.faqQuestions).toHaveLength(1)
        expect(wrapper.text()).toContain('Hur betalar jag min avgift?')
        wrapper.unmount()
    })

    it('answers a question chosen via category flow with the exact verified answer', async () => {
        const wrapper = await mountView()
        await new Promise((r) => setTimeout(r, 0))
        await wrapper.vm.openCategoryFromHome(category)
        await new Promise((r) => setTimeout(r, 0))
        const callsBefore = client.post.mock.calls.length
        await wrapper.vm.askFaq(wrapper.vm.faqQuestions[0])
        await new Promise((r) => setTimeout(r, 0))
        expect(wrapper.vm.messages[1].text).toBe('EXAKT_VERIFIERAT_SVAR')
        expect(client.post.mock.calls.length).toBe(callsBefore)
        wrapper.unmount()
    })

    it('loads and renders FAQ categories when the panel is opened', async () => {
        const wrapper = await mountView()
        await wrapper.vm.toggleFaqPanel()
        await new Promise((r) => setTimeout(r, 0))
        expect(client.get).toHaveBeenCalledWith('/chatbot/faq/categories')
        expect(wrapper.text()).toContain('Avgifter')
        wrapper.unmount()
    })

    it('loads questions for the selected category', async () => {
        client.get.mockImplementation((url) => {
            if (url === '/chatbot/status') return Promise.resolve({ data: { data: { status: 'available' } } })
            if (url === '/chatbot/faq/categories') return Promise.resolve({ data: { categories: [category] } })
            if (url === `/chatbot/faq/categories/${category._id}/questions`) {
                return Promise.resolve({ data: { faqs: [faqItem], total: 1, page: 1, limit: 10, totalPages: 1 } })
            }
            return Promise.resolve({ data: {} })
        })
        const wrapper = await mountView()
        await wrapper.vm.toggleFaqPanel()
        await wrapper.vm.selectCategory(category)
        await new Promise((r) => setTimeout(r, 0))
        expect(wrapper.text()).toContain('Hur betalar jag min avgift?')
        wrapper.unmount()
    })

    it('displays the exact verified answer without an extra API call', async () => {
        const wrapper = await mountView()
        const callsBefore = client.post.mock.calls.length
        await wrapper.vm.askFaq(faqItem)
        await new Promise((r) => setTimeout(r, 0))
        const messages = wrapper.vm.messages
        expect(messages).toHaveLength(2)
        expect(messages[0].role).toBe('user')
        expect(messages[0].text).toBe('Hur betalar jag min avgift?')
        expect(messages[1].role).toBe('assistant')
        expect(messages[1].text).toBe('EXAKT_VERIFIERAT_SVAR')
        expect(client.post.mock.calls.length).toBe(callsBefore)
        wrapper.unmount()
    })

    it('shows an error state when categories fail to load', async () => {
        client.get.mockImplementation((url) => {
            if (url === '/chatbot/status') return Promise.resolve({ data: { data: { status: 'available' } } })
            if (url === '/chatbot/faq/categories') return Promise.reject(new Error('network down'))
            return Promise.resolve({ data: {} })
        })
        const wrapper = await mountView()
        await wrapper.vm.toggleFaqPanel()
        await new Promise((r) => setTimeout(r, 0))
        expect(wrapper.vm.faqCategoriesError).toMatch(/Kunde inte hämta kategorier/)
        wrapper.unmount()
    })

    it('shows empty state when no categories exist', async () => {
        client.get.mockImplementation((url) => {
            if (url === '/chatbot/status') return Promise.resolve({ data: { data: { status: 'available' } } })
            if (url === '/chatbot/faq/categories') return Promise.resolve({ data: { categories: [] } })
            return Promise.resolve({ data: {} })
        })
        const wrapper = await mountView()
        await wrapper.vm.toggleFaqPanel()
        await new Promise((r) => setTimeout(r, 0))
        expect(wrapper.text()).toContain('Inga kategorier finns ännu.')
        wrapper.unmount()
    })

    it('still asks free-text questions through /chatbot/ask', async () => {
        const wrapper = await mountView()
        await wrapper.vm.ask('En fri fråga om studier')
        await new Promise((r) => setTimeout(r, 0))
        expect(client.post).toHaveBeenCalledWith('/chatbot/ask', { question: 'En fri fråga om studier' })
        expect(wrapper.vm.messages[1].text).toBe('AI-svar')
        wrapper.unmount()
    })
})
