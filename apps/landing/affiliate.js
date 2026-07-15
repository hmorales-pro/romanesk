// Attribution affilié — capture aff_click + ref, cookie 30 jours.
(function () {
  var COOKIE_DAYS = 30;
  var params = new URLSearchParams(window.location.search);
  var affClick = params.get('aff_click');
  var ref = params.get('ref');

  function setCookie(name, value, days) {
    var d = new Date();
    d.setTime(d.getTime() + days * 86400000);
    document.cookie =
      encodeURIComponent(name) + '=' + encodeURIComponent(value) +
      ';expires=' + d.toUTCString() +
      ';path=/;SameSite=Lax';
  }

  function getCookie(name) {
    var match = document.cookie.match(
      new RegExp('(?:^|;\\s*)' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '=([^;]*)')
    );
    return match ? decodeURIComponent(match[1]) : null;
  }

  if (affClick) setCookie('aff_click', affClick, COOKIE_DAYS);
  if (ref) setCookie('aff_ref', ref, COOKIE_DAYS);

  window.__affiliate = {
    getClickId: function () { return getCookie('aff_click'); },
    getRef: function () { return getCookie('aff_ref'); },
    toStripeMetadata: function () {
      var clickId = getCookie('aff_click');
      var r = getCookie('aff_ref');
      var meta = {};
      if (clickId) meta.aff_click_id = clickId;
      if (r) meta.ref = r;
      return meta;
    },
    toPostbackPayload: function (orderId, amount, opts) {
      opts = opts || {};
      var clickId = getCookie('aff_click');
      var r = getCookie('aff_ref');
      if (!clickId && !r) return null;
      var payload = { external_order_id: orderId, amount: amount };
      if (clickId) payload.click_id = clickId;
      if (r) payload.ref = r;
      if (opts.status) payload.status = opts.status;
      if (opts.currency) payload.currency = opts.currency;
      if (opts.customer_email) payload.customer_email = opts.customer_email;
      if (opts.customer_name) payload.customer_name = opts.customer_name;
      if (opts.occurred_at) payload.occurred_at = opts.occurred_at;
      return payload;
    }
  };
})();
