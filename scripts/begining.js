import { DonJonMap } from "./donjon-script.js" ;

Hooks.once("init", function() {
    console.log("DonJonMap | Init");

    window.DonJonMap = window.DonJonMap || new DonJonMap();

    Hooks.on(
        "renderSceneDirectory",
        (app, html, data) => {
            console.log("DonJonMap | Hook to add button to SceneDirectory");

            window.DonJonMap.importButton = $(
                `<div class="action-buttons donjon-map-actions flexrow">
                    <button class="donjon-map-import">DonJonMap Import Scene</button>
                </div>`
            );

            window.DonJonMap.importButton.click(() => {
                window.DonJonMap.importButtonClicked();
            });

            html.find(".header-actions").after(window.DonJonMap.importButton);
        }
    );
});
