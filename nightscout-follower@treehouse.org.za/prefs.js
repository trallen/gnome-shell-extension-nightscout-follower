import Gio from 'gi://Gio';
import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';

import {ExtensionPreferences, gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';


export default class NightscoutPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        window._settings = this.getSettings();

        // Create a preferences page, with a single group
        const page = new Adw.PreferencesPage();
        window.add(page);

        const group = new Adw.PreferencesGroup({
            title: _('Settings'),
        });
        page.add(group);


        const update_row = new Adw.SwitchRow({
            title: _('Connect to Nightscout'),
            subtitle: _('Update current data from Nightscout'),
        });
        group.add(update_row);

        window._settings.bind('update-data', update_row, 'active',
            Gio.SettingsBindFlags.DEFAULT);


        const url_row = new Adw.EntryRow({
            title: _('Nightscout URL'),
        });
        url_row.set_input_purpose(Gtk.InputPurpose.GTK_INPUT_PURPOSE_URL)
        url_row.set_show_apply_button(true);
        group.add(url_row);

        url_row.set_text(window._settings.get_string('url'));
        url_row.connect('apply', () => {
            window._settings.set_string('url', url_row.text);
        });


        const units = Array('mg/dL', 'mmol/L');

        const guint2str = function (unitId) {
            return units[unitId];
        };
        const str2guint = function(unitName) {
            return units.indexOf(unitName);
        };

        const list = Gtk.StringList.new(units);
        const units_row = new Adw.ComboRow({
            title: _('Units'),
            model: list,
        });
        group.add(units_row);
        let unitId = str2guint(window._settings.get_string('units'));
        //console.log(unitId);
        units_row.set_selected(unitId);
        units_row.connect('notify::selected', () => {
            let unitName = guint2str(units_row.get_selected());
            //console.log(unitName);
            window._settings.set_string('units', unitName);
        });
    };

}
