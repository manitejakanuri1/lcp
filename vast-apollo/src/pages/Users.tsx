import { useState, useEffect } from 'react'
import { Layout } from '../components/layout/Layout'
import { Button, Input, Modal } from '../components/ui'
import { usersApi, authApi, type User } from '../lib/api'

export function Users() {
    const [users, setUsers] = useState<User[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [isModalOpen, setIsModalOpen] = useState(false)
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [error, setError] = useState('')
    const [successMessage, setSuccessMessage] = useState('')

    const [formData, setFormData] = useState({
        username: '',
        email: '',
        password: '',
        full_name: '',
        role: 'salesman' as 'founder' | 'salesman' | 'accounting'
    })

    useEffect(() => {
        fetchUsers()
    }, [])

    const fetchUsers = async () => {
        try {
            const data = await usersApi.getAll()
            setUsers(data || [])
        } catch (err) {
            console.error('Error fetching users:', err)
        } finally {
            setIsLoading(false)
        }
    }

    const handleCreateUser = async (e: React.FormEvent) => {
        e.preventDefault()
        setError('')
        setSuccessMessage('')
        setIsSubmitting(true)

        try {
            // Create user via API
            const result = await authApi.register(
                formData.username,
                formData.email,
                formData.password,
                formData.full_name,
                formData.role
            )

            setSuccessMessage(`User "${formData.username}" created successfully!`)
            setFormData({ username: '', email: '', password: '', full_name: '', role: 'salesman' })
            setIsModalOpen(false)

            // Refresh user list
            fetchUsers()
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : 'Error creating user'
            setError(message)
        } finally {
            setIsSubmitting(false)
        }
    }

    const handleDeleteUser = async (userId: string, userName: string) => {
        alert('User deletion is disabled for security. Please manage users through Supabase Dashboard.')
    }

    const handleRoleChange = async (userId: string, newRole: string) => {
        try {
            await usersApi.updateRole(userId, newRole)
            setSuccessMessage('User role updated successfully')
            fetchUsers()
        } catch (err) {
            console.error('Error updating role:', err)
            setError('Failed to update user role')
        }
    }

    return (
        <Layout>
            <div className="max-w-4xl mx-auto p-4 sm:p-6 lg:p-8">
                {/* Header */}
                <div className="flex justify-between items-center mb-6">
                    <div>
                        <h1 className="text-2xl font-bold text-[var(--color-text)]">User Management</h1>
                        <p className="text-[var(--color-text-muted)]">
                            {users.length} user{users.length !== 1 ? 's' : ''} registered
                        </p>
                    </div>
                    <Button variant="primary" onClick={() => setIsModalOpen(true)}>
                        + Add User
                    </Button>
                </div>

                {/* User List */}
                {isLoading ? (
                    <div className="flex justify-center py-12">
                        <div className="w-8 h-8 border-2 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin" />
                    </div>
                ) : users.length === 0 ? (
                    <div className="text-center py-12">
                        <p className="text-[var(--color-text-muted)]">No users found</p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {users.map((user) => (
                            <div
                                key={user.id}
                                className="bg-[var(--color-surface-elevated)] border border-[var(--color-border)] rounded-xl p-4 flex items-center justify-between"
                            >
                                <div className="flex items-center gap-4">
                                    <div className="w-10 h-10 rounded-full bg-[var(--color-primary-light)] flex items-center justify-center text-[var(--color-primary)] font-semibold text-sm">
                                        {(user.full_name || user.email).charAt(0).toUpperCase()}
                                    </div>
                                    <div>
                                        <p className="font-medium text-[var(--color-text)]">
                                            {user.full_name || 'No name'}
                                        </p>
                                        <p className="text-sm text-[var(--color-text-muted)]">{user.email}</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-3">
                                    <div className={`px-3 py-1 rounded-full text-xs font-medium capitalize ${user.role === 'founder'
                                        ? 'bg-amber-500/10 text-amber-500'
                                        : 'bg-blue-500/10 text-blue-500'
                                        }`}>
                                        {user.role}
                                    </div>
                                    <button
                                        onClick={() => handleDeleteUser(user.id, user.full_name || user.email)}
                                        className="p-2 text-red-500 hover:bg-red-500/10 rounded-lg transition-colors"
                                        title="Remove User"
                                    >
                                        Del
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {/* Add User Modal */}
                <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="Add New User">
                    <form onSubmit={handleCreateUser} className="space-y-4">
                        <Input
                            label="Username"
                            value={formData.username}
                            onChange={(e) => setFormData({ ...formData, username: e.target.value.toLowerCase() })}
                            required
                            helperText="Lowercase letters and numbers only"
                        />
                        <Input
                            label="Full Name"
                            value={formData.full_name}
                            onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                            required
                        />
                        <Input
                            type="email"
                            label="Email"
                            value={formData.email}
                            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                            required
                        />
                        <Input
                            type="password"
                            label="Password"
                            value={formData.password}
                            onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                            required
                            helperText="Minimum 6 characters"
                        />
                        <div>
                            <label className="block text-sm font-medium text-[var(--color-text)] mb-2">
                                Role
                            </label>
                            <div className="grid grid-cols-3 gap-2">
                                {(['salesman', 'accounting', 'founder'] as const).map((role) => (
                                    <button
                                        key={role}
                                        type="button"
                                        onClick={() => setFormData({ ...formData, role })}
                                        className={`py-2.5 rounded-lg font-medium capitalize transition-all text-sm ${formData.role === role
                                            ? 'bg-[var(--color-primary)] text-white'
                                            : 'bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-text)]'
                                        }`}
                                    >
                                        {role}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {error && (
                            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-500 text-sm">
                                {error}
                            </div>
                        )}

                        {successMessage && (
                            <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/20 text-green-500 text-sm">
                                {successMessage}
                            </div>
                        )}

                        <div className="flex gap-3 pt-4">
                            <Button type="button" variant="secondary" onClick={() => setIsModalOpen(false)}>
                                Cancel
                            </Button>
                            <Button type="submit" variant="primary" loading={isSubmitting}>
                                Create User
                            </Button>
                        </div>
                    </form>
                </Modal>
            </div>
        </Layout>
    )
}
