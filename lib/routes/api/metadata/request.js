'use strict';

/**
 * Dependencies
 */

const MAX_REDIRECTS = require('../../../../config').max_redirects;
const debug = require('debug')('magnet:request');
const URL = require('url');
const protocols = {
  'https:': require('https'),
  'http:': require('http')
};

/**
 * Unwraps a request applying any
 * matched adaptors at each layer.
 *
 * @param  {String} url
 * @param  {Array} options.adaptors
 * @param  {String} options.unadaptedUrl
 * @param  {Number} options.redirectCount
 * @return {Promise}
 */
module.exports = function request(url, options) {
  debug('request', url, options);
  if (!url) {
    return Promise.reject(new Error('url undefined'));
  }

  options = options || {};
  options.redirectCount = options.redirectCount || 0;
  options.unadaptedUrl = options.unadaptedUrl || url;
  options.adaptors = options.adaptors || [];

  const adaptorUrl = findAdaptorUrl(options.adaptors, url);

  if (adaptorUrl) {
    debug('using adaptor', adaptorUrl);
    return request(adaptorUrl, options);
  }

  return new Promise((resolve, reject) => {
    const protocol = protocols[URL.parse(url).protocol];
    protocol.get(url, res => {
      debug('got response, %s', url);
      const status = res.statusCode;
      let text = '';

      if (isError(status)) {
        return reject(new Error(`http error ${status} - ${url}`));
      }

      if (isRedirect(status)) {

        // ensure the response is being consumed
        // this is required for Node v0.10+
        res.resume();

        if (options.redirectCount >= MAX_REDIRECTS) {
          return reject(new Error('max redirects reached'));
        }

        delete options.unadaptedUrl;
        options.redirectCount++;

        return request(res.headers.location, options)
          .then(resolve, reject);
      }

      res.setEncoding('utf8');
      res.on('data', chunk => {
        debug('data', chunk);
        text += chunk;
      });

      res.on('error', reject);
      res.on('end', () => {
        debug('res end');
        resolve({
          text: text,
          finalUrl: url,
          unadaptedUrl: options.unadaptedUrl,
          contentType: res.headers['content-type']
        });
      });
    })

    .on('error', reject);
  });
};

/**
 * Utils
 */

function isRedirect(code) {
  return ~[301, 302, 303, 305, 307, 308].indexOf(code);
}

function isError(code) {
  return code < 200 || code >= 400;
}

/**
 * Find an adaptor that matches
 * the final found URL.
 *
 * @param  {Array} adaptors
 * @param  {String} url
 * @return {(String|undefined)}
 */
function findAdaptorUrl(adaptors, url) {
  if (!adaptors) {
    return;
  }

  debug('find adaptor url', url);
  const adaptor = adaptors.find(adaptor => adaptor.pattern.test(url));
  if (adaptor) {
    return `${adaptor.url}?url=${encodeURIComponent(url)}`;
  }
}
