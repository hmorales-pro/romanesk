// Empêche l'ouverture d'une console secondaire au lancement de l'exécutable
// release sur Windows.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    romanesk_desktop_lib::run()
}
