/** Camera barcode scanner for packaged food (EAN/UPC). Asks for camera permission only when opened. */
import { CameraView, useCameraPermissions } from 'expo-camera';
import React, { useRef } from 'react';
import { View } from 'react-native';
import { Button, Sheet, Txt } from './ui';

export function BarcodeScanner({ visible, onClose, onScanned }: { visible: boolean; onClose: () => void; onScanned: (code: string) => void }) {
  const [perm, request] = useCameraPermissions();
  const done = useRef(false);
  if (!visible) { done.current = false; return null; }
  return (
    <Sheet visible onClose={onClose} title="Scan a barcode">
      {!perm ? null
        : !perm.granted ? (<>
          <Txt muted>Orchid only uses the camera while this screen is open, to read the barcode.</Txt>
          {perm.canAskAgain ? <Button label="Allow camera" onPress={() => void request()} /> : <Txt>Camera access is off for Orchid. You can turn it on in your phone's settings.</Txt>}
        </>) : (
          <View style={{ height: 320, borderRadius: 16, overflow: 'hidden' }}>
            <CameraView style={{ flex: 1 }} facing="back"
              barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e'] }}
              onBarcodeScanned={({ data }) => { if (!done.current && /^\d{8,14}$/.test(data)) { done.current = true; onScanned(data); } }} />
          </View>
        )}
    </Sheet>
  );
}
