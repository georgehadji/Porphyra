import type { Meta, StoryObj } from "@storybook/react";
import { Card } from "./Card";

const meta: Meta<typeof Card> = {
  title: "Components/Card",
  component: Card,
};
export default meta;

type Story = StoryObj<typeof Card>;

export const Default: Story = {
  render: () => (
    <Card style={{ maxWidth: 360 }}>
      <h3 style={{ margin: 0, fontFamily: "var(--p-font-display)" }}>Senior Product Designer</h3>
      <p style={{ color: "var(--color-muted)" }}>Acme Inc. — Remote (EU)</p>
    </Card>
  ),
};
