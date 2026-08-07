"use client";

import { VaultProvider } from "@/lib/vault/VaultContext";
import type { ReactNode } from "react";

export function Providers({ children }: { children: ReactNode }) {
  return <VaultProvider>{children}</VaultProvider>;
}
