/******/ (() => { // webpackBootstrap
/******/ 	"use strict";


self.fallback = async request => {
  // https://developer.mozilla.org/en-US/docs/Web/API/RequestDestination
  switch (request.destination) {
    case 'document':
      if (true) return caches.match("/offline", {
        ignoreSearch: true
      });
    case 'image':
      if (true) return caches.match("/placeholder-image.svg", {
        ignoreSearch: true
      });
    case 'audio':
      if (false) {}
    case 'video':
      if (false) {}
    case 'font':
      if (true) return caches.match("https://fonts.gstatic.com/s/roboto/v27/KFOmCnqEu92Fr1Mu4mxKKTU1Kg.woff2", {
        ignoreSearch: true
      });
    case '':
      if (false) {}
    default:
      return Response.error();
  }
};
/******/ })()
;