/**
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at

 * http://www.apache.org/licenses/LICENSE-2.0

 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

export function isFF (): boolean {
  if (typeof window === 'undefined') {
    return false
  }
  return window.navigator.userAgent.toLowerCase().includes('firefox')
}

export function isIOS (): boolean {
  if (typeof window === 'undefined') {
    return false
  }
  return /iPhone|iPad|iPod|iOS/.test(window.navigator.userAgent)
}

export function isMac (): boolean {
  if (typeof window === 'undefined') {
    return false
  }
  // eslint-disable-next-line @typescript-eslint/no-deprecated -- navigator.platform is the most reliable macOS signal; userAgent can be spoofed/reduced.
  const platform = window.navigator.platform
  return platform.includes('Mac') || window.navigator.userAgent.includes('Mac OS X')
}
