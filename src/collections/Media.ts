import type { CollectionConfig } from 'payload'

import {
  FixedToolbarFeature,
  InlineToolbarFeature,
  lexicalEditor,
} from '@payloadcms/richtext-lexical'

import { anyone } from '../access/anyone'
import { authenticated } from '../access/authenticated'

export const Media: CollectionConfig = {
  slug: 'media',
  folders: true,
  access: {
    create: authenticated,
    delete: authenticated,
    read: anyone,
    update: authenticated,
  },
  fields: [
    {
      name: 'alt',
      type: 'text',
      //required: true,
    },
    {
      name: 'caption',
      type: 'richText',
      editor: lexicalEditor({
        features: ({ rootFeatures }) => {
          return [...rootFeatures, FixedToolbarFeature(), InlineToolbarFeature()]
        },
      }),
    },
    {
      name: 'isTemplate',
      type: 'checkbox',
      label: 'Is Template Reference',
      defaultValue: false,
      admin: {
        description: 'Mark this image as a template reference for AI generation',
        position: 'sidebar',
      },
    },
    {
      name: 'templateType',
      type: 'select',
      label: 'Template Type (Number of Images)',
      options: [
        { label: '1 Image Template', value: 'single' },
        { label: '2 Images Template', value: 'dual' },
        { label: '3 Images Template', value: 'triple' },
        { label: '4 Images Template', value: 'quad' },
      ],
      admin: {
        condition: (data) => data.isTemplate === true,
        description: 'How many images this template is designed for',
        position: 'sidebar',
      },
    },
  ],
  upload: true,
}
