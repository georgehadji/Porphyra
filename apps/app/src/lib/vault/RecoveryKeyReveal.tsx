"use client";

import { Button } from "@porphyra/ui";
import { useState } from "react";

interface RecoveryKeyRevealProps {
  mnemonic: string;
  onAcknowledged: () => void;
}

/**
 * Shown exactly once, right after vault bootstrap. The mnemonic exists only
 * in this component's props (derived in memory during bootstrapVault) —
 * never sent to the server, never in a URL, never in localStorage. Closing
 * the tab without saving it means it's gone for good; the checkbox exists
 * so that's a deliberate acknowledgement, not a surprise later.
 */
export function RecoveryKeyReveal({ mnemonic, onAcknowledged }: RecoveryKeyRevealProps) {
  const [acknowledged, setAcknowledged] = useState(false);
  const words = mnemonic.split(" ");

  return (
    <div className="recovery-reveal">
      <h1>Save your recovery key</h1>
      <p>
        This is the only way back into your vault if you forget your password. We don't
        store it — if you lose both your password and this phrase, your data is genuinely
        unrecoverable. See <a href="/security">how the encryption works</a>.
      </p>

      <ol className="mnemonic-grid" aria-label="Recovery phrase, 24 words">
        {words.map((word, i) => (
          <li key={`${i}-${word}`}>
            <span className="word-index">{i + 1}</span>
            {word}
          </li>
        ))}
      </ol>

      <label className="ack">
        <input
          type="checkbox"
          checked={acknowledged}
          onChange={(e) => setAcknowledged(e.target.checked)}
        />
        <span>
          I've written this down or saved it somewhere safe outside this browser. I
          understand Porphyra cannot recover my data without it.
        </span>
      </label>

      <Button variant="primary" disabled={!acknowledged} onClick={onAcknowledged}>
        Continue
      </Button>

      <style jsx>{`
        .recovery-reveal {
          max-width: 32rem;
          margin: 4rem auto;
          padding: 0 1.5rem;
        }
        h1 {
          font-family: var(--p-font-display);
          color: var(--p-porphyra-900);
        }
        p {
          color: var(--color-muted);
        }
        .mnemonic-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 0.5rem;
          list-style: none;
          margin: 1.5rem 0;
          padding: 1.25rem;
          background: var(--color-surface-sunken);
          border: 1px solid var(--color-border);
          border-radius: var(--card-radius);
          font-family: var(--p-font-mono);
        }
        .mnemonic-grid li {
          display: flex;
          gap: 0.4rem;
          align-items: baseline;
        }
        .word-index {
          color: var(--color-faint);
          font-size: 0.75rem;
          min-width: 1.25rem;
        }
        .ack {
          display: flex;
          align-items: flex-start;
          gap: 0.5rem;
          margin-bottom: 1.5rem;
          color: var(--color-muted);
          font-size: 0.9rem;
        }
        .ack input {
          margin-top: 3px;
        }
      `}</style>
    </div>
  );
}
