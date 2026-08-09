import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import AplTab from '../../src/views/Student/tabs/AplTab.vue'

const buildStudent = (overrides = {}) => ({
    _id: 'stu-1',
    name: 'Anna Elev',
    aplStatus: 'GRAY',
    aplStatusAuto: false,
    aplWeeksRemaining: null,
    aplStartDate: null,
    aplEndDate: null,
    aplStatusHistory: [],
    ...overrides,
})

describe('AplTab.vue - APL period & auto-RED', () => {
    const mountTab = (student) =>
        mount(AplTab, {
            props: { student },
            global: {
                stubs: {
                    FileUploaderDownloader: true,
                },
            },
        })

    it('shows the auto-red note when the status is auto-derived', () => {
        const wrapper = mountTab(
            buildStudent({
                aplStatus: 'RED',
                aplStatusAuto: true,
                aplWeeksRemaining: 2,
            })
        )

        expect(wrapper.find('.auto-red-note').exists()).toBe(true)
        expect(wrapper.text()).toContain('Auto-röd')
        expect(wrapper.text()).toContain('2 veckor')
        expect(wrapper.text()).toContain('Snart slut')
    })

    it('uses singular form when one week remains', () => {
        const wrapper = mountTab(
            buildStudent({
                aplStatus: 'RED',
                aplStatusAuto: true,
                aplWeeksRemaining: 1,
            })
        )

        expect(wrapper.text()).toContain('1 vecka')
    })

    it('hides the auto-red note when the status is not auto-derived', () => {
        const wrapper = mountTab(
            buildStudent({
                aplStatus: 'GREEN',
                aplStatusAuto: false,
            })
        )

        expect(wrapper.find('.auto-red-note').exists()).toBe(false)
    })

    it('shows the APL-period section with dates and weeks remaining', () => {
        const wrapper = mountTab(
            buildStudent({
                aplStartDate: '2026-05-01T00:00:00.000Z',
                aplEndDate: '2026-07-01T00:00:00.000Z',
                aplWeeksRemaining: 2,
            })
        )

        expect(wrapper.find('.apl-period-row').exists()).toBe(true)
        expect(wrapper.text()).toContain('APL-period')
        expect(wrapper.text()).toContain('2 v kvar')
    })

    it('hides the APL-period section when no dates are available', () => {
        const wrapper = mountTab(buildStudent())

        expect(wrapper.text()).not.toContain('APL-period')
        expect(wrapper.find('.apl-period-row').exists()).toBe(false)
    })
})
