/** Web build: no camera module (it would load a remote decoder). Scanning lives in the phone app. */
import React from 'react';
import { Sheet, Txt } from './ui';

export function BarcodeScanner({ visible, onClose }: { visible: boolean; onClose: () => void; onScanned: (code: string) => void }) {
  if (!visible) return null;
  return (
    <Sheet visible onClose={onClose} title="Scan a barcode">
      <Txt muted>Barcode scanning needs the phone app. You can type the number from the package into search instead.</Txt>
    </Sheet>
  );
}
