import type { CollectionConfig } from 'payload'

import { authenticated } from '../access/authenticated'

export const Jobs: CollectionConfig = {
  slug: 'jobs',
  access: {
    create: authenticated,
    delete: authenticated,
    read: authenticated,
    update: authenticated,
  },
  admin: {
    defaultColumns: ['productName', 'status', 'createdAt'],
    useAsTitle: 'productName',
  },
  fields: [
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'pending',
      options: [
        { label: 'Pending', value: 'pending' },
        { label: 'Processing', value: 'processing' },
        { label: 'Completed', value: 'completed' },
        { label: 'Failed', value: 'failed' },
        { label: 'Approved', value: 'approved' },
        { label: 'Rejected', value: 'rejected' },
      ],
      admin: {
        position: 'sidebar',
      },
    },
    {
      type: 'tabs',
      tabs: [
        {
          label: 'Product Data',
          fields: [
            {
              name: 'productName',
              type: 'text',
              required: true,
            },
            {
              name: 'productDescription',
              type: 'textarea',
            },
            {
              name: 'contentTopic',
              type: 'text',
              label: 'Content Topic',
              admin: {
                description: 'Main topic from Google Sheet (Content_Topic column)',
              },
            },
            {
              name: 'postTitleHeadline',
              type: 'text',
              label: 'Post Title / Headline',
              admin: {
                description: 'Title or headline from Google Sheet (Post_Title_Headline column)',
              },
            },
            {
              name: 'contentDescription',
              type: 'textarea',
              label: 'Content Description',
              admin: {
                description: 'Full content description from Google Sheet (Content_Description column)',
              },
            },
            {
              name: 'mood',
              type: 'text',
            },
            {
              name: 'targetPlatforms',
              type: 'select',
              hasMany: true,
              options: [
                { label: 'Facebook', value: 'facebook' },
                { label: 'Instagram Feed', value: 'instagram_feed' },
                { label: 'Instagram Story', value: 'instagram_story' },
              ],
            },
          ],
        },
        {
          label: 'Reference Images',
          fields: [
            {
              name: 'referenceImageIds',
              type: 'array',
              fields: [
                {
                  name: 'imageId',
                  type: 'text',
                  label: 'Google Drive File ID',
                },
              ],
            },
            {
              name: 'referenceImageUrls',
              type: 'array',
              fields: [
                {
                  name: 'url',
                  type: 'text',
                },
              ],
            },
            {
              name: 'useCollage',
              type: 'checkbox',
              label: 'Use Collage',
              defaultValue: false,
              admin: {
                description: 'Combine multiple images into a collage before enhancement',
              },
            },
            {
              name: 'collageTemplate',
              type: 'select',
              label: 'Collage Template',
              options: [
                { label: 'Auto-select', value: 'auto' },
                { label: 'Hero Grid (1 large + 3 small)', value: 'hero_grid' },
                { label: 'Split (2 halves)', value: 'split' },
                { label: 'Masonry (Pinterest style)', value: 'masonry' },
                { label: 'Grid (2x2)', value: 'grid' },
              ],
              admin: {
                condition: (data: any) => data.useCollage === true,
                description: 'Layout template for collage creation',
              },
            },
            {
              name: 'enhancementStrength',
              type: 'number',
              label: 'Enhancement Strength',
              defaultValue: 0.4,
              min: 0.3,
              max: 0.8,
              admin: {
                description: 'How much the AI modifies the image (0.3 = subtle, 0.8 = heavy)',
                step: 0.05,
              },
            },
          ],
        },
        {
          label: 'Generated Content',
          fields: [
            {
              name: 'generatedPrompt',
              type: 'textarea',
              admin: {
                readOnly: true,
              },
            },
            {
              name: 'promptGeneratedAt',
              type: 'date',
              admin: {
                readOnly: true,
                date: {
                  displayFormat: 'yyyy-MM-dd HH:mm:ss',
                },
              },
            },
            {
              name: 'generatedImages',
              type: 'group',
              fields: [
                {
                  name: 'facebook',
                  type: 'group',
                  fields: [
                    {
                      name: 'url',
                      type: 'text',
                    },
                    {
                      name: 'width',
                      type: 'number',
                    },
                    {
                      name: 'height',
                      type: 'number',
                    },
                  ],
                },
                {
                  name: 'instagram_feed',
                  type: 'group',
                  fields: [
                    {
                      name: 'url',
                      type: 'text',
                    },
                    {
                      name: 'width',
                      type: 'number',
                    },
                    {
                      name: 'height',
                      type: 'number',
                    },
                  ],
                },
                {
                  name: 'instagram_story',
                  type: 'group',
                  fields: [
                    {
                      name: 'url',
                      type: 'text',
                    },
                    {
                      name: 'width',
                      type: 'number',
                    },
                    {
                      name: 'height',
                      type: 'number',
                    },
                  ],
                },
              ],
            },
          ],
        },
        {
          label: 'Approval',
          fields: [
            {
              name: 'approvedBy',
              type: 'relationship',
              relationTo: 'users',
              admin: {
                readOnly: true,
              },
            },
            {
              name: 'approvedAt',
              type: 'date',
              admin: {
                readOnly: true,
                date: {
                  displayFormat: 'yyyy-MM-dd HH:mm:ss',
                },
              },
            },
            {
              name: 'rejectedBy',
              type: 'relationship',
              relationTo: 'users',
              admin: {
                readOnly: true,
              },
            },
            {
              name: 'rejectedAt',
              type: 'date',
              admin: {
                readOnly: true,
                date: {
                  displayFormat: 'yyyy-MM-dd HH:mm:ss',
                },
              },
            },
            {
              name: 'rejectionReason',
              type: 'textarea',
            },
          ],
        },
      ],
    },
    {
      name: 'createdBy',
      type: 'relationship',
      relationTo: 'users',
      admin: {
        position: 'sidebar',
        readOnly: true,
      },
    },
    {
      name: 'errorMessage',
      type: 'textarea',
      admin: {
        position: 'sidebar',
        readOnly: true,
      },
    },
    {
      name: 'retryCount',
      type: 'number',
      defaultValue: 0,
      admin: {
        position: 'sidebar',
        readOnly: true,
      },
    },
  ],
  timestamps: true,
}
