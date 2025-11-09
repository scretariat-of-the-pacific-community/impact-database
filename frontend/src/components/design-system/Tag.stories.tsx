import type { Meta, StoryObj } from '@storybook/react';
import Tag from './Tag';

const meta: Meta<typeof Tag> = {
  title: 'Design System/Tag',
  component: Tag,
  args: {
    children: 'Flood',
  },
};

export default meta;
type Story = StoryObj<typeof Tag>;

export const Brand: Story = {
  args: {
    tone: 'brand',
  },
};

export const Removable: Story = {
  args: {
    tone: 'info',
    onRemove: () => {},
  },
};

export const Danger: Story = {
  args: {
    tone: 'danger',
  },
};
