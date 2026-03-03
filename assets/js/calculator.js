// assets/js/calculator.js
console.log("ENVAL calculator.js versie 260223_live_no_button");

(function () {
  function euro(n) {
    return "€ " + Number(n).toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  }

  const form = document.getElementById("calcForm");
  if (!form) return;

  const outKwh = document.getElementById("calcResultKwh");
  const outKm = document.getElementById("calcResultKm");

  const elKwhYear = document.getElementById("kwhYear");
  const elEurPerKwh = document.getElementById("eurPerKwh");
  const elKmYear = document.getElementById("kmYear");
  const elEurPerKm = document.getElementById("eurPerKm");

  function bandbreedteHTML(net) {
    const lo = net * 0.75;
    const hi = net * 1.25;

    return (
      'Bruto bandbreedte (±25%):<br>' +
      "<b>" + euro(lo) + " – " + euro(hi) + "</b>" +
      "<small>Op basis van uw invoer ligt de indicatie rond " +
      euro(net) +
      " per jaar. ** </small>"
    );
  }

  function n(el) {
    return Math.max(0, Number(el?.value || 0));
  }

  function calc() {
    const kwh = n(elKwhYear);
    const eurPerKwh = n(elEurPerKwh);
    const grossKwh = kwh * eurPerKwh;

    const km = n(elKmYear);
    const eurPerKm = n(elEurPerKm);
    const grossKm = km * eurPerKm;

    if (outKwh) outKwh.innerHTML = bandbreedteHTML(grossKwh);
    if (outKm) outKm.innerHTML = bandbreedteHTML(grossKm);
  }

  // Geen knop meer nodig; voorkom accidental submit.
  form.addEventListener("submit", function (e) {
    e.preventDefault();
    calc();
  });

  // Live recalc bij input/change
  [elKwhYear, elEurPerKwh, elKmYear, elEurPerKm].forEach((el) => {
    if (!el) return;
    el.addEventListener("input", calc);
    el.addEventListener("change", calc);
  });

  calc();
})();