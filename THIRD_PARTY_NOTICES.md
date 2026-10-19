# Third-party notices

Code from the packages below is bundled into the storefront's browser JavaScript, where the
minifier drops their licence headers, so their notices are reproduced here. The map code loads
only when a visitor opens the address map picker; Firebase's only when web push is configured and
a visitor turns it on (or it is on and its token is checked). Vazirmatn's licence (SIL OFL 1.1) ships next
to the font: `src/assets/fonts/vazirmatn/OFL.txt`.

## Leaflet 1.9.4

Package `leaflet` (the map of OpenStreetMap stores). Neshan's SDK below also contains a copy.

```
BSD 2-Clause License

Copyright (c) 2010-2023, Volodymyr Agafonkin
Copyright (c) 2010-2011, CloudMade
All rights reserved.

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:

1. Redistributions of source code must retain the above copyright notice, this
   list of conditions and the following disclaimer.

2. Redistributions in binary form must reproduce the above copyright notice,
   this list of conditions and the following disclaimer in the documentation
   and/or other materials provided with the distribution.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
```

## @neshan-maps-platform/leaflet 1.0.8

Neshan's Leaflet SDK by Neshan Maps Org. (the map of stores with `NESHAN_MAP_KEY`). Its
`package.json` declares the licence `ISC`; the package ships no licence file or copyright line.
It is a build of Leaflet 1.9.4, whose notice is above.

## Firebase JavaScript SDK 12.19.0

Packages `firebase`, `@firebase/app` and `@firebase/messaging` (with `@firebase/installations`,
`@firebase/component`, `@firebase/util` and `@firebase/logger`): web push's token. Copyright Google
LLC. Licensed under the Apache License, Version 2.0 (the "License"); you may not use these files
except in compliance with the License. You may obtain a copy of the License at
<http://www.apache.org/licenses/LICENSE-2.0>. Unless required by applicable law or agreed to in
writing, software distributed under the License is distributed on an "AS IS" BASIS, WITHOUT
WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific
language governing permissions and limitations under the License.

Firebase bundles `idb` 7.1.1:

```
ISC License (ISC)
Copyright (c) 2016, Jake Archibald <jaffathecake@gmail.com>

Permission to use, copy, modify, and/or distribute this software for any purpose with or without fee is hereby granted, provided that the above copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
```

## sharp 0.35.5 and libvips (server side)

Not in the browser's JavaScript: the server makes the installed app's icons with `sharp`
(Apache-2.0, Copyright Lovell Fuller and contributors), which Next.js also uses for image
optimisation. Its prebuilt binaries, `@img/sharp-<platform>` (Apache-2.0) and
`@img/sharp-libvips-<platform>` (libvips and its dependencies, LGPL-3.0-or-later and the other
licences listed in that package's README), and `@img/colour` (MIT) ship in the standalone output
and the Docker image with their licence files under `node_modules/.pnpm/`.

## Map data

OpenStreetMap tiles: © OpenStreetMap contributors (Open Database License), credited on the map.
