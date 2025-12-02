import type { CollectionConfig } from 'payload'

export const ApiConfigs: CollectionConfig = {
  slug: 'api-configs',
  access: {
    read: ({ req: { user } }) => Boolean(user && (user as { role?: string }).role === 'admin'),
    create: ({ req: { user } }) => Boolean(user && (user as { role?: string }).role === 'admin'),
    update: ({ req: { user } }) => Boolean(user && (user as { role?: string }).role === 'admin'),
    delete: ({ req: { user } }) => Boolean(user && (user as { role?: string }).role === 'admin'),
  },
  admin: {
    defaultColumns: ['name', 'isActive', 'lastUsed'],
    useAsTitle: 'name',
  },
  fields: [
    {
      name: 'name',
      type: 'select',
      required: true,
      unique: true,
      options: [
        { label: 'Google Sheets API', value: 'google_sheets' },
        { label: 'Google Drive API', value: 'google_drive' },
        { label: 'Claude API', value: 'claude' },
        { label: 'DALL-E API', value: 'dalle' },
      ],
    },
    {
      name: 'apiKey',
      type: 'text',
      required: true,
      admin: {
        description: 'API Key will be encrypted in database',
      },
    },
    {
      name: 'endpoint',
      type: 'text',
      admin: {
        description: 'Optional: Custom API endpoint URL',
      },
    },
    {
      name: 'isActive',
      type: 'checkbox',
      defaultValue: true,
      admin: {
        position: 'sidebar',
      },
    },
    {
      name: 'lastUsed',
      type: 'date',
      admin: {
        position: 'sidebar',
        readOnly: true,
        date: {
          displayFormat: 'yyyy-MM-dd HH:mm:ss',
        },
      },
    },
  ],
  timestamps: true,
}
