import type { CollectionConfig } from 'payload'

import { authenticated } from '../access/authenticated'

export const JobLogs: CollectionConfig = {
  slug: 'job-logs',
  access: {
    create: authenticated,
    delete: authenticated,
    read: authenticated,
    update: authenticated,
  },
  admin: {
    defaultColumns: ['jobId', 'level', 'message', 'timestamp'],
    useAsTitle: 'message',
  },
  fields: [
    {
      name: 'jobId',
      type: 'relationship',
      relationTo: 'jobs',
      required: true,
      index: true,
    },
    {
      name: 'level',
      type: 'select',
      required: true,
      options: [
        { label: 'Info', value: 'info' },
        { label: 'Warning', value: 'warning' },
        { label: 'Error', value: 'error' },
      ],
      admin: {
        position: 'sidebar',
      },
    },
    {
      name: 'message',
      type: 'textarea',
      required: true,
    },
    {
      name: 'metadata',
      type: 'json',
      admin: {
        description: 'Additional data in JSON format',
      },
    },
    {
      name: 'timestamp',
      type: 'date',
      required: true,
      defaultValue: () => new Date().toISOString(),
      admin: {
        date: {
          displayFormat: 'yyyy-MM-dd HH:mm:ss',
        },
      },
    },
  ],
  timestamps: true,
}
