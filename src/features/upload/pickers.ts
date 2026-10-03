import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { Platform } from 'react-native';

import { MAX_IMAGES_PER_CONVERSION } from '@shared/limits';
import { AppError } from '@shared/errors';

export interface PickedPdf {
  uri: string;
  name: string;
  size: number | null;
  mimeType: string | null;
  /** Web only: the browser File. */
  file?: Blob;
}

export interface PickedImage {
  uri: string;
  width: number;
  height: number;
  mimeType: string | null;
}

export async function pickPdf(): Promise<PickedPdf | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: 'application/pdf',
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (result.canceled) return null;
  const asset = result.assets[0];
  if (!asset) return null;
  return {
    uri: asset.uri,
    name: asset.name,
    size: asset.size ?? null,
    mimeType: asset.mimeType ?? null,
    file: asset.file,
  };
}

export async function pickImages(): Promise<PickedImage[] | null> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsMultipleSelection: true,
    selectionLimit: MAX_IMAGES_PER_CONVERSION,
    orderedSelection: true,
    quality: 1,
  });
  if (result.canceled) return null;
  return result.assets.map((a) => ({
    uri: a.uri,
    width: a.width,
    height: a.height,
    mimeType: a.mimeType ?? null,
  }));
}

export function isScannerAvailable(): boolean {
  return Platform.OS === 'ios' || Platform.OS === 'android';
}

/** Camera document scan (edge detection + crop). Native only; loaded lazily (no web module). */
export async function scanDocument(): Promise<PickedImage[] | null> {
  if (!isScannerAvailable()) throw new AppError('PROVIDER_UNAVAILABLE');
  const {
    default: DocumentScanner,
    ResponseType,
    ScanDocumentResponseStatus,
  } = await import('react-native-document-scanner-plugin');
  const result = await DocumentScanner.scanDocument({
    croppedImageQuality: 85,
    maxNumDocuments: MAX_IMAGES_PER_CONVERSION,
    responseType: ResponseType.ImageFilePath,
  });
  if (result.status === ScanDocumentResponseStatus.Cancel || !result.scannedImages?.length) return null;
  return result.scannedImages.map((uri) => ({ uri, width: 0, height: 0, mimeType: 'image/jpeg' }));
}
