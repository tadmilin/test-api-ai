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
        { label: 'Enhancing', value: 'enhancing' },
        { label: 'Review Pending', value: 'review_pending' },
        { label: 'Style Selection', value: 'style_selection' },
        { label: 'Generating Template', value: 'generating_template' },
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
              name: 'hashtags',
              type: 'text',
              label: 'Hashtags',
              admin: {
                description: 'Hashtags from Google Sheet',
              },
            },
            {
              name: 'notes',
              type: 'textarea',
              label: 'Notes',
              admin: {
                description: 'Additional notes from Google Sheet',
              },
            },
            {
              name: 'photoTypeFromSheet',
              type: 'select',
              label: 'Photo Type (from Sheet)',
              options: [
                { label: 'Bedroom', value: 'bedroom' },
                { label: 'Dining / Restaurant', value: 'dining' },
                { label: 'Lobby', value: 'lobby' },
                { label: 'Pool', value: 'pool' },
                { label: 'Bathroom', value: 'bathroom' },
                { label: 'Generic', value: 'generic' },
              ],
              admin: {
                description: 'Photo type classified from sheet content (auto-detected)',
                readOnly: true,
              },
            },
            {
              name: 'resolvedPhotoType',
              type: 'select',
              label: 'Resolved Photo Type',
              options: [
                { label: 'Bedroom', value: 'bedroom' },
                { label: 'Dining / Restaurant', value: 'dining' },
                { label: 'Lobby', value: 'lobby' },
                { label: 'Pool', value: 'pool' },
                { label: 'Bathroom', value: 'bathroom' },
                { label: 'Generic', value: 'generic' },
              ],
              admin: {
                description: 'Final photo type after hybrid detection (sheet + GPT Vision)',
                readOnly: true,
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
              name: 'templateType',
              type: 'select',
              label: 'Template Type',
              defaultValue: 'triple',
              options: [
                { label: 'Single (1 image)', value: 'single' },
                { label: 'Dual (2 images)', value: 'dual' },
                { label: 'Triple (3 images)', value: 'triple' },
                { label: 'Quad (4 images)', value: 'quad' },
              ],
              admin: {
                description: 'Number of images in the final template',
              },
            },
            {
              name: 'templateMode',
              type: 'select',
              label: 'Template Generation Mode',
              defaultValue: 'satori',
              options: [
                { label: 'Consistent (Satori - Pixel Perfect)', value: 'satori' },
                { label: 'Creative (AI - Dynamic & Unique)', value: 'ai' },
              ],
              admin: {
                description: 'Satori = consistent layout, AI = creative dynamic design',
              },
            },
            {
              name: 'enhancedImageUrls',
              type: 'array',
              label: 'Enhanced Images',
              fields: [
                {
                  name: 'url',
                  type: 'text',
                  label: 'Image URL',
                },
                {
                  name: 'status',
                  type: 'select',
                  defaultValue: 'pending',
                  options: [
                    { label: 'Pending', value: 'pending' },
                    { label: 'Approved', value: 'approved' },
                    { label: 'Regenerating', value: 'regenerating' },
                  ],
                },
                {
                  name: 'originalUrl',
                  type: 'text',
                  label: 'Original Image URL',
                },
              ],
              admin: {
                description: 'Enhanced images with approval status',
              },
            },
            {
              name: 'reviewCompleted',
              type: 'checkbox',
              label: 'Review Completed',
              defaultValue: false,
              admin: {
                description: 'All enhanced images have been reviewed and approved',
              },
            },
            {
              name: 'styleSelected',
              type: 'checkbox',
              label: 'Style Selected',
              defaultValue: false,
              admin: {
                description: 'Template style has been selected',
              },
            },
            {
              name: 'templateStyle',
              type: 'select',
              label: 'Template Style (AI Mode)',
              options: [
                { label: 'Minimal (Clean & Simple)', value: 'minimal' },
                { label: 'Classic (Elegant & Luxury)', value: 'classic' },
                { label: 'Graphic (Creative & Artistic)', value: 'graphic' },
              ],
              admin: {
                description: 'Style for AI-generated template',
                condition: (data: Record<string, unknown>) => data.templateMode === 'ai',
              },
            },
            {
              name: 'finalImageUrl',
              type: 'text',
              label: 'Final Template URL',
              admin: {
                description: 'URL of the final generated template',
                readOnly: true,
              },
            },
            {
              name: 'socialMediaFormat',
              type: 'select',
              label: 'Output Format',
              defaultValue: 'facebook_post',
              options: [
                { label: 'Facebook Post (1200x630px)', value: 'facebook_post' },
                { label: 'Instagram Feed (1080x1080px)', value: 'instagram_feed' },
                { label: 'Instagram Story (1080x1920px)', value: 'instagram_story' },
                { label: 'Custom 16:9 (1920x1080px)', value: 'custom_16_9' },
                { label: 'Custom 4:3 (1600x1200px)', value: 'custom_4_3' },
                { label: 'Custom 1:1 (1200x1200px)', value: 'custom_1_1' },
              ],
              admin: {
                description: 'Target social media platform format (only for Graphic Design)',
                condition: (data: Record<string, unknown>) => !data.useOverlayDesign,
              },
            },
            {
              name: 'useOverlayDesign',
              type: 'checkbox',
              label: 'Use Overlay Design',
              defaultValue: false,
              admin: {
                description: 'Use NEW overlay system: Hero image + smaller overlays + graphic patterns',
              },
            },
            {
              name: 'overlayAspectRatio',
              type: 'select',
              label: 'Overlay Aspect Ratio',
              defaultValue: '3:1',
              options: [
                { label: '3:1 (Wide - 1800x600px)', value: '3:1' },
                { label: '2:1 (Standard - 1600x800px)', value: '2:1' },
              ],
              admin: {
                description: 'Aspect ratio for overlay design',
                condition: (data: Record<string, unknown>) => data.useOverlayDesign === true,
              },
            },
            {
              name: 'heroImageIndex',
              type: 'number',
              label: 'Hero Image Index',
              defaultValue: 0,
              admin: {
                description: 'Which image to use as the main background (0 = first image, 1 = second, etc.)',
                condition: (data: Record<string, unknown>) => data.useOverlayDesign === true,
              },
            },
            {
              name: 'overlayTheme',
              type: 'select',
              label: 'Overlay Theme',
              defaultValue: 'modern',
              options: [
                { label: 'Modern', value: 'modern' },
                { label: 'Luxury', value: 'luxury' },
                { label: 'Resort', value: 'resort' },
              ],
              admin: {
                description: 'Theme style for overlay design',
                condition: (data: Record<string, unknown>) => data.useOverlayDesign === true,
              },
            },
            {
              name: 'graphicTheme',
              type: 'select',
              label: 'Graphic Theme',
              defaultValue: 'modern',
              options: [
                { label: 'Modern', value: 'modern' },
                { label: 'Luxury', value: 'luxury' },
                { label: 'Minimal', value: 'minimal' },
              ],
              admin: {
                description: 'Theme style for graphic design',
                condition: (data: Record<string, unknown>) => !data.useOverlayDesign,
              },
            },
            {
              name: 'enhancementStrength',
              type: 'number',
              label: 'Enhancement Strength',
              defaultValue: 0.30,
              min: 0.25,
              max: 0.40,
              admin: {
                description: 'How much the AI modifies the image (0.25 = subtle, 0.30 = recommended, 0.40 = noticeable)',
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
