import * as WebBrowser from 'expo-web-browser';

/** Opens an external URL in the in-app browser (keeps the user in SignFlow). */
export async function openLink(url: string): Promise<void> {
  await WebBrowser.openBrowserAsync(url);
}
