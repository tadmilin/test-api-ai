import type { CollectionConfig } from 'payload'

import { authenticated } from '../access/authenticated'

export const Jobs: CollectionConfig = {
  slug: 'jobs',
  access: {
    create: authenticated,
    delete: () => true, // Allow all deletes
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
      name: 'outputSize',
      type: 'text',
      label: 'Output Size',
      required: true,
      defaultValue: '1:1-2K',
      admin: {
        position: 'sidebar',
        description: 'Output image dimensions - 1:1 will be upscaled, others will be resized',
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
              type: 'text',
              label: 'Photo Type (from Sheet)',
              admin: {
                description: 'Photo type from Google Sheet (any value allowed)',
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
              name: 'customPrompt',
              type: 'textarea',
              label: 'Custom Prompt',
              admin: {
                description: 'Custom prompt for image enhancement (overrides auto-generated prompt from photo type)',
                placeholder: 'Enter custom prompt for AI image enhancement...',
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
              name: 'referenceImageUrls',
              type: 'array',
              label: 'Input Images (Google Drive URLs)',
              fields: [
                {
                  name: 'url',
                  type: 'text',
                  label: 'Drive URL',
                },
              ],
            },
            {
              name: 'sheetRows',
              type: 'array',
              label: 'Sheet Rows Data (Per-Image Metadata)',
              fields: [
                {
                  name: 'productName',
                  type: 'text',
                  label: 'Product Name',
                },
                {
                  name: 'photoType',
                  type: 'text',
                  label: 'Photo Type',
                },
                {
                  name: 'contentTopic',
                  type: 'text',
                  label: 'Content Topic',
                },
                {
                  name: 'postTitleHeadline',
                  type: 'text',
                  label: 'Post Title / Headline',
                },
                {
                  name: 'contentDescription',
                  type: 'textarea',
                  label: 'Content Description',
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
              name: 'templateUrl',
              type: 'text',
              label: 'Generated Template URL',
              admin: {
                description: 'Base64 data URL or blob URL of the generated template composite',
              },
            },
            {
              name: 'templateGeneration',
              type: 'group',
              label: 'Template Generation Status',
              admin: {
                description: 'Template generation tracking (similar to enhancedImageUrls)',
              },
              fields: [
                {
                  name: 'predictionId',
                  type: 'text',
                  label: 'Generation Prediction ID',
                  admin: {
                    description: 'Replicate prediction ID for template generation',
                  },
                },
                {
                  name: 'upscalePredictionId',
                  type: 'text',
                  label: 'Upscale Prediction ID',
                  admin: {
                    description: 'Replicate prediction ID for upscaling',
                  },
                },
                {
                  name: 'status',
                  type: 'select',
                  label: 'Status',
                  options: [
                    { label: 'Pending', value: 'pending' },
                    { label: 'Processing', value: 'processing' },
                    { label: 'Succeeded', value: 'succeeded' },
                    { label: 'Failed', value: 'failed' },
                  ],
                  defaultValue: 'pending',
                },
                {
                  name: 'url',
                  type: 'text',
                  label: 'Final Template URL',
                  admin: {
                    description: 'Final upscaled template URL',
                  },
                },
              ],
            },
            {
              name: 'templatePredictionId',
              type: 'text',
              label: 'Template Generation Prediction ID (Legacy)',
              admin: {
                description: 'DEPRECATED: Use templateGeneration.predictionId instead',
                hidden: true,
              },
            },
            {
              name: 'templateUpscalePredictionId',
              type: 'text',
              label: 'Template Upscale Prediction ID (Legacy)',
              admin: {
                description: 'DEPRECATED: Use templateGeneration.upscalePredictionId instead',
                hidden: true,
              },
            },
            {
              name: 'enhancedImageUrls',
              type: 'array',
              label: 'Enhanced Images',
              fields: [
                {
                  name: 'originalUrl',
                  type: 'text',
                  label: 'Original Image URL',
                  admin: {
                    description: 'Google Drive URL or Blob URL of the source image',
                  },
                },
                {
                  name: 'tempOutputUrl',
                  type: 'text',
                  label: 'Temporary Replicate URL',
                  admin: {
                    description: 'Replicate output URL (expires 24-48h) - will be uploaded to Blob',
                    readOnly: true,
                  },
                },
                {
                  name: 'url',
                  type: 'text',
                  label: 'Permanent Storage URL',
                  admin: {
                    description: 'Cloudinary or storage URL (permanent) - final output',
                  },
                },
                {
                  name: 'webhookFailed',
                  type: 'checkbox',
                  label: 'Webhook Failed',
                  defaultValue: false,
                  admin: {
                    description: 'Flag indicating webhook upload failed - polling should retry',
                    readOnly: true,
                  },
                },
                {
                  name: 'status',
                  type: 'select',
                  defaultValue: 'pending',
                  options: [
                    { label: 'Pending', value: 'pending' },
                    { label: 'Completed', value: 'completed' },
                    { label: 'Failed', value: 'failed' },
                    { label: 'Approved', value: 'approved' },
                    { label: 'Regenerating', value: 'regenerating' },
                  ],
                },
                {
                  name: 'predictionId',
                  type: 'text',
                  label: 'Replicate Prediction ID',
                  admin: {
                    description: 'Used for polling async prediction status',
                  },
                },
                {
                  name: 'upscalePredictionId',
                  type: 'text',
                  label: 'Upscale Prediction ID',
                  admin: {
                    description: 'Replicate prediction ID for upscaling to 2048x2048 (text-to-image only)',
                  },
                },
                {
                  name: 'photoType',
                  type: 'text',
                  label: 'Photo Type',
                  admin: {
                    description: 'Type from Sheet row (bedroom, pool, etc.)',
                  },
                },
                {
                  name: 'contentTopic',
                  type: 'text',
                  label: 'Content Topic',
                  admin: {
                    description: 'Content topic from Sheet row',
                  },
                },
                {
                  name: 'postTitleHeadline',
                  type: 'text',
                  label: 'Post Title / Headline',
                  admin: {
                    description: 'Post title from Sheet row',
                  },
                },
                {
                  name: 'contentDescription',
                  type: 'textarea',
                  label: 'Content Description',
                  admin: {
                    description: 'Content description from Sheet row',
                  },
                },
                {
                  name: 'error',
                  type: 'textarea',
                  label: 'Error Message',
                  admin: {
                    description: 'Error message from Replicate if failed',
                  },
                },
              ],
              admin: {
                description: 'Enhanced images with metadata from Sheet',
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
              name: 'finalImageUrl',
              type: 'text',
              label: 'Final Template URL',
              admin: {
                description: 'URL of the final generated template',
                readOnly: true,
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
