import store, { api } from '@/store/store.js'
import { vi } from 'vitest'

const resetApiMocks = () => {
    api.post = vi.fn()
    api.get = vi.fn()
    api.put = vi.fn()
    api.delete = vi.fn()
}

const defaultState = () => ({ user: null, tasks: [] })

describe('Vuex Store', () => {
    beforeEach(() => {
        store.replaceState(defaultState())
        resetApiMocks()
    })

    it('should have a default state', () => {
        expect(store.state.user).toBeNull()
        expect(store.state.tasks).toEqual([])
    })

    describe('getters', () => {
        it('isLoggedIn', () => {
            store.replaceState({ user: null, tasks: [] })
            expect(store.getters.isLoggedIn).toBe(false)
            store.replaceState({ user: { name: 'Test User' }, tasks: [] })
            expect(store.getters.isLoggedIn).toBe(true)
        })

        it('userRole', () => {
            store.replaceState({ user: { role: 'admin' }, tasks: [] })
            expect(store.getters.userRole).toBe('admin')

            store.replaceState({ user: { roles: ['teacher', 'admin'] }, tasks: [] })
            expect(store.getters.userRole).toBe('teacher')

            store.replaceState({ user: {}, tasks: [] })
            expect(store.getters.userRole).toBe('guest')

            store.replaceState({ user: null, tasks: [] })
            expect(store.getters.userRole).toBe('guest')
        })

        it('isAdmin', () => {
            store.replaceState({ user: { role: 'admin' }, tasks: [] })
            expect(store.getters.isAdmin).toBe(true)

            store.replaceState({ user: { role: 'systemadmin' }, tasks: [] })
            expect(store.getters.isAdmin).toBe(true)

            store.replaceState({ user: { role: 'teacher' }, tasks: [] })
            expect(store.getters.isAdmin).toBe(false)
        })

        it('isSystemAdmin', () => {
            store.replaceState({ user: { role: 'systemadmin' }, tasks: [] })
            expect(store.getters.isSystemAdmin).toBe(true)

            store.replaceState({ user: { role: 'admin' }, tasks: [] })
            expect(store.getters.isSystemAdmin).toBe(false)
        })

        it('tasks', () => {
            const tasks = [{ id: 1, text: 'Test task' }]
            store.replaceState({ user: null, tasks })
            expect(store.getters.tasks).toEqual(tasks)
        })

        describe('hasPermission', () => {
            it('returns true for exact role', () => {
                store.replaceState({ user: { role: 'teacher' }, tasks: [] })
                expect(store.getters.hasPermission('teacher')).toBe(true)
            })

            it('returns true for higher role', () => {
                store.replaceState({ user: { role: 'admin' }, tasks: [] })
                expect(store.getters.hasPermission('teacher')).toBe(true)
            })

            it('returns false for lower role', () => {
                store.replaceState({ user: { role: 'student' }, tasks: [] })
                expect(store.getters.hasPermission('teacher')).toBe(false)
            })

            it('supports array of roles', () => {
                store.replaceState({ user: { role: 'teacher' }, tasks: [] })
                expect(store.getters.hasPermission(['teacher', 'admin'])).toBe(true)

                store.replaceState({ user: { role: 'admin' }, tasks: [] })
                expect(store.getters.hasPermission(['teacher', 'admin'])).toBe(true)

                store.replaceState({ user: { role: 'student' }, tasks: [] })
                expect(store.getters.hasPermission(['teacher', 'admin'])).toBe(false)
            })

            it('returns false for unknown role', () => {
                store.replaceState({ user: { role: 'unknown' }, tasks: [] })
                expect(store.getters.hasPermission('teacher')).toBe(false)
            })
        })
    })

    describe('mutations', () => {
        it('SET_USER', () => {
            const user = { name: 'Test User', roles: ['teacher'] }
            store.commit('SET_USER', user)
            expect(store.state.user).toEqual({ name: 'Test User', roles: ['teacher'], role: 'teacher' })
        })

        it('LOGOUT', () => {
            store.replaceState({ user: { name: 'Test User' }, tasks: [{ id: 1 }] })
            store.commit('LOGOUT')
            expect(store.state.user).toBeNull()
            expect(store.state.tasks).toEqual([])
        })

        it('SET_TASKS', () => {
            const tasks = [{ id: 1, text: 'Test task' }]
            store.commit('SET_TASKS', tasks)
            expect(store.state.tasks).toEqual(tasks)
        })

        it('ADD_TASK', () => {
            const task = { id: 1, text: 'New task' }
            store.commit('ADD_TASK', task)
            expect(store.state.tasks).toEqual([task])
        })

        it('UPDATE_TASK', () => {
            const updatedTask = { _id: 1, text: 'Updated task' }
            store.replaceState({ user: null, tasks: [{ _id: 1, text: 'Old task' }] })
            store.commit('UPDATE_TASK', updatedTask)
            expect(store.state.tasks).toEqual([updatedTask])
        })

        it('DELETE_TASK', () => {
            store.replaceState({ user: null, tasks: [{ _id: 1, text: 'Test task' }] })
            store.commit('DELETE_TASK', 1)
            expect(store.state.tasks).toEqual([])
        })

        it('DELETE_ALL_TASKS', () => {
            store.replaceState({ user: null, tasks: [{ id: 1 }, { id: 2 }] })
            store.commit('DELETE_ALL_TASKS')
            expect(store.state.tasks).toEqual([])
        })
    })

    describe('actions', () => {
        it('login success', async () => {
            const credentials = { email: 'test@test.com', password: 'password' }
            const user = { name: 'Test User' }
            api.post.mockResolvedValue({})
            api.get.mockResolvedValue({ data: { user } })

            const result = await store.dispatch('login', credentials)

            expect(api.post).toHaveBeenCalledWith('/auth/login', {
                email: credentials.email.trim(),
                password: credentials.password.trim(),
            })
            expect(api.get).toHaveBeenCalledWith('/auth/session')
            expect(store.state.user).toEqual(user)
            expect(result).toEqual({ success: true, message: 'Login successful' })
        })

        it('login failure', async () => {
            const credentials = { email: 'test@test.com', password: 'password' }
            const error = { response: { data: { message: 'Login failed' } } }
            api.post.mockRejectedValue(error)

            const result = await store.dispatch('login', credentials)

            expect(result).toEqual({ success: false, message: 'Login failed' })
        })

        it('fetchUser success', async () => {
            const user = { name: 'Test User' }
            api.get.mockResolvedValue({ data: { user } })

            await store.dispatch('fetchUser')

            expect(api.get).toHaveBeenCalledWith('/auth/session')
            expect(store.state.user).toEqual(user)
        })

        it('fetchUser failure logs out', async () => {
            const error = { response: { status: 401 } }
            api.get.mockRejectedValue(error)

            await store.dispatch('fetchUser')

            expect(store.state.user).toBeNull()
        })

        it('logout', async () => {
            api.post.mockResolvedValue({})
            store.replaceState({ user: { name: 'Test User' }, tasks: [{ id: 1 }] })

            await store.dispatch('logout')

            expect(api.post).toHaveBeenCalledWith('/auth/logout')
            expect(store.state.user).toBeNull()
            expect(store.state.tasks).toEqual([])
        })

        it('fetchTasks success', async () => {
            const tasks = [{ id: 1 }]
            api.get.mockResolvedValue({ data: tasks })

            await store.dispatch('fetchTasks')

            expect(api.get).toHaveBeenCalledWith('/task')
            expect(store.state.tasks).toEqual(tasks)
        })

        it('fetchTasks failure logs out', async () => {
            const error = { response: { status: 401 } }
            api.get.mockRejectedValue(error)

            await store.dispatch('fetchTasks')

            expect(store.state.user).toBeNull()
        })

        it('addTask', async () => {
            const description = 'New task'
            const task = { id: 1, description }
            api.post.mockResolvedValue({ data: task })

            await store.dispatch('addTask', description)

            expect(api.post).toHaveBeenCalledWith('/task', { description })
            expect(store.state.tasks).toEqual([task])
        })

        it('updateTask', async () => {
            const task = { _id: 1, description: 'Updated task' }
            store.replaceState({ user: null, tasks: [{ _id: 1, description: 'Old' }] })
            api.put.mockResolvedValue({ data: task })

            await store.dispatch('updateTask', task)

            expect(api.put).toHaveBeenCalledWith(`/task/${task._id}`, task)
            expect(store.state.tasks).toEqual([task])
        })

        it('deleteTask', async () => {
            const taskId = 1
            store.replaceState({ user: null, tasks: [{ _id: 1, text: 'Test' }] })
            await store.dispatch('deleteTask', taskId)

            expect(api.delete).toHaveBeenCalledWith(`/task/${taskId}`)
            expect(store.state.tasks).toEqual([])
        })

        it('deleteAllTasks', async () => {
            await store.dispatch('deleteAllTasks')

            expect(api.delete).toHaveBeenCalledWith('/delalltasks')
            expect(store.state.tasks).toEqual([])
        })
        describe('action error handling', () => {
            let consoleErrorSpy

            beforeEach(() => {
                consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => { })
            })

            afterEach(() => {
                consoleErrorSpy.mockRestore()
            })

            it('logs when logout API fails', async () => {
                api.post.mockRejectedValue(new Error('logout failed'))
                await store.dispatch('logout')
                expect(consoleErrorSpy).toHaveBeenCalledWith('Logout request failed:', expect.any(Error))
            })

            it('logs when addTask API fails', async () => {
                const error = new Error('boom')
                api.post.mockRejectedValue(error)
                await store.dispatch('addTask', 'not sent')
                expect(consoleErrorSpy).toHaveBeenCalledWith('Failed to add task:', expect.any(Error))
            })

            it('logs when updateTask API fails', async () => {
                const error = new Error('nope')
                api.put.mockRejectedValue(error)
                await store.dispatch('updateTask', { _id: 1 })
                expect(consoleErrorSpy).toHaveBeenCalledWith('Failed to update task:', expect.any(Error))
            })

            it('logs when deleteTask API fails', async () => {
                const error = new Error('gone')
                api.delete.mockRejectedValue(error)
                await store.dispatch('deleteTask', 1)
                expect(consoleErrorSpy).toHaveBeenCalledWith('Failed to delete task:', expect.any(Error))
            })

            it('logs when deleteAllTasks API fails', async () => {
                const error = new Error('all gone')
                api.delete.mockRejectedValue(error)
                await store.dispatch('deleteAllTasks')
                expect(consoleErrorSpy).toHaveBeenCalledWith('Failed to delete all tasks:', expect.any(Error))
            })
        })
    })
})
