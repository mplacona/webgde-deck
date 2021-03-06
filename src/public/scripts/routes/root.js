import {
  loadData,
  ConcatStream,
  getCompiledTemplate,
  Request,
  Response,
  caches,
  paths
 } from '../platform/common.js';

import { convertFeedItemsToJSON } from '../data/common.js';
 
let headTemplate = getCompiledTemplate(`${paths.assetPath}templates/head.html`);
let styleTemplate = getCompiledTemplate(`${paths.assetPath}templates/columns-styles.html`);
let columnTemplate = getCompiledTemplate(`${paths.assetPath}templates/column.html`);
let columnsTemplate = getCompiledTemplate(`${paths.assetPath}templates/columns.html`);
let itemTemplate = getCompiledTemplate(`${paths.assetPath}templates/item.html`);

const root = (nonce, paths) => {

  let config = loadData(`${paths.dataPath}config.json`).then(r => r.json());

  let concatStream = new ConcatStream;

  let jsonFeedData = fetchCachedFeedData(config, itemTemplate, columnTemplate);

  const streams = {
    styles: styleTemplate.then(render => config.then(c => render({config: c, nonce: nonce }))),
    data: columnsTemplate.then(render => jsonFeedData.then(columns => render({ columns: columns }))),
    itemTemplate: itemTemplate.then(render => render({options: {includeAuthor: false, new: true}, item: {}}))
  };
  
  const headStream = headTemplate.then(render => render({config: config, streams: streams, nonce: nonce}));

  headStream.then(stream => stream.pipeTo(concatStream.writable))
  
  return Promise.resolve(new Response(concatStream.readable, { status: "200" }))
}

// Helpers
const fetchCachedFeedData = (config, itemTemplate, columnTemplate) => {
  // Return a promise that resolves to a map of column id => cached data.
  const resolveCache = (cache, url) => (!!cache) ? cache.match(new Request(url)).then(response => (!!response) ? response.text() : undefined) : Promise.resolve();
  const templateOptions = {
    includeAuthor: false
  };

  const mapColumnsToCache = (cache, config) => { 
    return config.columns.map(column => {
      return {
              config: column,
              data: resolveCache(cache, `/proxy?url=${encodeURIComponent(column.feedUrl)}`).then(items => convertFeedItemsToJSON(items))
             };
      });
  };

  const renderItems = (items) => {
    return itemTemplate.then(render => render({ templateOptions: templateOptions, items: items}));
  };
  
  return caches.open('data')
      .then(cache => config.then(configData => mapColumnsToCache(cache, configData)))
      .then(columns => {
        return columns.map(column => {
          return column.data.then(data => {
            return {
              config: column.config,
              items: renderItems(data)
            }
          });
        })
      })
      .then(columns => columns.map(column => {
        return columnTemplate.then(render => column.then(c => { 
          //console.profile(c.config.name);
          let result = render({column: c});
          //console.profileEnd(c.config.name);
          return result;
        }
        ))}));
};

export const handler = root;