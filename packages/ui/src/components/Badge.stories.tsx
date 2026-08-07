import type { Meta, StoryObj } from "@storybook/react";
import { Badge } from "./Badge";

const meta: Meta<typeof Badge> = {
  title: "Components/Badge",
  component: Badge,
  args: { children: "Applied" },
};
export default meta;

type Story = StoryObj<typeof Badge>;

export const AllTones: Story = {
  render: () => (
    <div style={{ display: "flex", gap: 8 }}>
      <Badge tone="neutral">Discarded</Badge>
      <Badge tone="brand">Applied</Badge>
      <Badge tone="success">Offer</Badge>
      <Badge tone="warning">Interview</Badge>
      <Badge tone="danger">Rejected</Badge>
    </div>
  ),
};
