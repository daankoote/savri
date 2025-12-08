// 
// Savri - basis JavaScript //
// Doel 1: automatisch het juiste jaartal in de footer zetten. //
// Doel 2 (optioneel): smooth scrolling voor interne links. //
//

document.addEventListener("DOMContentLoaded", function () {
    // // 1) Dynamisch jaartal in de footer zetten //
    var yearSpan = document.getElementById("year");
    if (yearSpan) {
        var currentYear = new Date().getFullYear();
        yearSpan.textContent = currentYear;
    }

    // // 2) Smooth scroll voor navigatielinks die naar een ID verwijzen (bijv. #installateurs) //
    var links = document.querySelectorAll('a[href^="#"]');

    links.forEach(function (link) {
        link.addEventListener("click", function (event) {
            var targetId = this.getAttribute("href").substring(1); // haalt de tekst na het # teken op
            var targetElement = document.getElementById(targetId);

            if (targetElement) {
                event.preventDefault(); // voorkomt de standaard "direct naar sectie springen"

                // Scrollt soepel naar de gekozen sectie //
                targetElement.scrollIntoView({
                    behavior: "smooth",
                    block: "start"
                });
            }
        });
    });
});
