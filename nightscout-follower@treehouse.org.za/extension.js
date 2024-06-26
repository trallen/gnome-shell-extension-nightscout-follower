/* extension.js
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 2 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 *
 * SPDX-License-Identifier: GPL-2.0-or-later
 */

import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';
import St from 'gi://St';
import Soup from 'gi://Soup';

import {Extension, gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as MessageTray from 'resource:///org/gnome/shell/ui/messageTray.js';

export default class NightscoutExtension extends Extension {
    enable() {
        this._settings = this.getSettings();
        this._httpSession = new Soup.Session();
        this._indicator = new PanelMenu.Button(0.0, this.metadata.name, false);
        this._systemSource = MessageTray.getSystemSource();
        this._active = this._settings.get_boolean('update-data');

        this._label = new St.Label({
            text: "Loading...",
            y_align: Clutter.ActorAlign.CENTER,
            style_class: 'fresh_data',
        });
        this._indicator.add_child(this._label);

        this._indicator.menu.addAction(_('Preferences'),
            () => this.openPreferences());

        Main.panel.addToStatusArea(this.uuid, this._indicator);

        this._dismissUp = -1;
        this._dismissDown = -1;
        this._dismissHigh = -1;
        this._dismissLow = -1;
        this._dismissMissing = -1;

        this._update();
        this._timeout = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 60, () => {
            this._update();
            return GLib.SOURCE_CONTINUE;
        });

        this._settings.connect('changed::update-data', (settings, key) => {
            this._active = settings.get_boolean(key);
        });
        this._settings.connect('changed::url', () => {
            this._update();
        });
        this._settings.connect('changed::units', () => {
            this._update();
        });
    };

    disable() {
        if (this._timeout) {
            GLib.Source.remove(this._timeout);
            this._timeout = null;
        }
        this._indicator.destroy();
        this._indicator = null;
        this._settings = null;
    };

    _getIcon(name) {
        const iconDir = `${this.path}/icons/`;
        return Gio.icon_new_for_string(`${iconDir}${name}.svg`);
    };

    _update() {
        if (!this._active) {
            this._label.set_text("Disabled");
            return;
        }

        //console.log("nightscout-follower: updating...")
        // Watch for changes to a specific setting
        this._fetch((status, data) => {
            if (typeof data === 'undefined') {
                this._label.set_text("No Data");
                return;
            }

            let entry = data[0];
            //console.log("nightscout-follower entry: ", entry);

            if (typeof entry === 'undefined') {
                this._label.set_text("No Data");
                return;
            }

            let now = Date.now();

            let units = this._settings.get_string('units');

            // These should probably be settings
            let deltaUp = 20;
            let deltaDown = -20;
            let minHigh = 180;
            let maxLow = 80;
            let maxElapsedSecs = 600;
            let warnEverySecs = 10 * 60;

            let glucoseValue = entry.sgv;
            let directionValue = entry.direction;
            let delta = entry.delta;
            let date = entry.date;

            let displayGlucoseValue = glucoseValue;
            let displayDelta = delta;
            if (units === 'mmol/L') {
                // Based on the molar mass of glucose, conversion
                // is 18.0156 (older value sometimes used is 18.0182)
                //
                // https://pubchem.ncbi.nlm.nih.gov/compound/glucose
                //displayGlucoseValue /= 18.0182;
                displayGlucoseValue /= 18.0156;
                displayGlucoseValue = displayGlucoseValue.toFixed(1);
                //displayDelta /= 18.0182;
                displayDelta /= 18.0156;
                displayDelta = displayDelta.toFixed(2);
            }

            let elapsedSecs = Math.floor((now - date) / 1000);
            let elapsedMins = Math.floor(elapsedSecs / 60);

            let arrow = this._fromNameToArrowCharacter(directionValue);
            let text = `${displayGlucoseValue} ${arrow}`;

            if (elapsedSecs >= maxElapsedSecs) {
                this._label.style_class = 'expired-data';
                // only warn every warnEverySecs
                if (this._dismissMissing < 0 || Math.floor((now - this._dismissMissing) / 1000) > warnEverySecs ) {
                    this._notify({
                        title: _('Missing readings'),
                        body: _('There have been no new readings since %d minutes ago'.format(elapsedMins)),
                    });
                    this._dismissMissing = now;
                }
            } else {
                this._label.style_class = 'fresh-data';
            }

            if (glucoseValue < maxLow) {
                this._label.style_class = 'low-glucose';
                // only warn every warnEverySecs
                if (this._dismissLow < 0 || Math.floor((now - this._dismissLow) / 1000) > warnEverySecs ) {
                    this._notify({
                        title: _('Blood glucose is low!'),
                        body: _('Your glucose is now %f %s'.format(displayGlucoseValue, units)),
                    });
                    this._dismissLow = now;
                }
            } else if (glucoseValue > minHigh) {
                this._label.style_class = 'high-glucose';
                // only warn every warnEverySecs
                if (this._dismissHigh < 0 || Math.floor((now - this._dismissHigh) / 1000) > warnEverySecs ) {
                    this._notify({
                        title: _('Blood glucose is high!'),
                        body: _('Your glucose is now %f %s'.format(displayGlucoseValue, units)),
                    });
                    this._dismissHigh = now;
                }
            } else {
                this._label.style_class = 'fresh-data';
            }

            if (delta >= deltaUp) {
                console.log("delta: ", delta);
                // only warn every warnEverySecs
                if (this._dismissUp < 0 || Math.floor((now - this._dismissUp) / 1000) > warnEverySecs ) {
                    this._notify({
                        title: _('Blood glucose rising quickly'),
                        body: _('Your glucose has risen %f %s since the last reading'.format(displayDelta, units)),
                    });
                    this._dismissUp = now;
                }
            } else if (delta <= deltaDown) {
                console.log("delta: ", delta);
                console.log("displayDelta: ", displayDelta);
                console.log("deltaDown: ", deltaDown);
                // only warn every warnEverySecs
                if (this._dismissDown < 0 || Math.floor((now - this._dismissDown) / 1000) > warnEverySecs ) {
                    this._notify({
                        title: _('Blood glucose falling quickly'),
                        body: _('Your glucose has fallen %f %s since the last reading'.format(displayDelta, units)),
                    });
                    this._dismissDown = now;
                }
            }

            this._label.set_text(text);
        })
    };

    _fetch(callback) {
        if (this._httpSession === null) {
            this._httpSession = new Soup.Session();
        }

        let settingsUrl = GLib.Uri.parse(this._settings.get_string('url'), GLib.UriFlags.NONE)
        let jsonUrl = GLib.Uri.build(
          GLib.UriFlags.ENCODED,
          settingsUrl.get_scheme(),
          settingsUrl.get_userinfo(),
          settingsUrl.get_host(),
          settingsUrl.get_port(),
          '/api/v1/entries.json',
          'count=1' + (settingsUrl.get_query() ? '&' + settingsUrl.get_query() : ''),
          settingsUrl.get_fragment(),
        );
        //console.log("nightscout-follower url: " + jsonUrl.to_string());

        //this._httpSession.set_proxy_resolver(new Gio.ProxyResolver())
        const message = new Soup.Message({
            method: 'GET',
            uri: jsonUrl,
        });

        return this._httpSession.send_and_read_async(message, GLib.PRIORITY_DEFAULT, null, (session, result) => {
            //console.log("nightscout-follower response status: " + message.get_status());
            if (message.get_status() === Soup.Status.OK) {
                let bytes = session.send_and_read_finish(result);
                let decoder = new TextDecoder('utf-8');
                let response = decoder.decode(bytes.get_data());
                //console.log(`Response: ${response}`);

                let data;
                try {
                    data = JSON.parse(response);
                } catch (err) {
                    console.log("nightscout-follower error: ", err)
                    return;
                }
                callback(message.get_status(), data);
            } else if (message.get_status() === Soup.Status.UNAUTHORIZED)  {
                this._notify({
                    title: _('Nightscout Extension'),
                    body: _('Unable to retrieve data: authorization failed'),
                    activate_callback: () => { this.openPreferences() },
                });
            } else {
                Main.notify('Nightscout Extension', _('Unable to retrieve data: please check your internet connection'));
            }
        });
    };

    _notify({title, body, activated_callback, destroy_callback}) {
        const notification = new MessageTray.Notification({
            source: this._systemSource,
            title: title,
            body: body,
            //gicon: new Gio.ThemedIcon({name: 'dialog-warning'}),
            //iconName: 'dialog-warning',
            gicon: this._getIcon("nightscout-icon"),
            urgency: MessageTray.Urgency.NORMAL,
        });
        if (typeof(activate_callback) === 'function') {
            notification.connect('activated', (_notification, reason) => {
                activate_callback(_notification, reason);
            });
        }
        if (typeof(destroy_callback) === 'function') {
            notification.connect('destroy', (_notification, reason) => {
                destroy_callback(_notification, reason);
            });
        }
        this._systemSource.addNotification(notification);
    };

    _fromNameToArrowCharacter(directionValue) {
        switch (directionValue) {
            case "DoubleDown":
                return "⇊";
            case "DoubleUp":
                return "⇈";
            case "Flat":
                return "→";
            case "FortyFiveDown":
                return "↘";
            case "FortyFiveUp":
                return "↗";
            case "SingleDown":
                return "↓";
            case "SingleUp":
                return "↑";
            case "TripleDown":
                return "⇊";
            case "TripleUp":
                return "⇈";
            default:
                return "";
        }
    };
}
