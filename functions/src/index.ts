import * as functions from 'firebase-functions';
import * as suq from 'suq';
import * as cors from 'cors';

// // Start writing Firebase Functions
// // https://firebase.google.com/docs/functions/typescript
//
export const helloWorld = functions.https.onRequest((request, response) => {
 response.send("Hello from Firebase!");
});

const params = (request)=>{
  const q = request.url.split('?');
  const result = {};
  if (q.length>=2) {
    q[1].split('&').forEach( item=> {
      try {
        const [k,v] = item.split('=');
        result[ k ] = v;
      } catch (e){
        result[ item.split('=')[0] ] = '';
      }
    });
  }
  return result;
}


const CORS_WHITELIST:string[] = ['http://localhost:8100', 'http://localhost:8101', 'https://mappi3-c91f1.firebaseapp.com'];

/**
 * warning: applenews redirects do NOT include og:url link
 * // const testLink = "https://apple.news/AXmG-6cIzSM2i7mu24Mla-Q"
 * compare: 
 * - https://us-central1-mappi3-c91f1.cloudfunctions.net/getOpenGraph?url=https://apple.news/AE4ykQz9tRw6asIVKRVvxRQ
 * - https://us-central1-mappi3-c91f1.cloudfunctions.net/getOpenGraph?url=https://www.nytimes.com/2018/12/07/science/climate-change-mass-extinction.html
 * 
 * check for http 304 redirect
 */
export const getOpenGraph = functions.https.onRequest((request, response) => {
  request.params = params(request);
  // console.log("querystring=", request.params);
  const requestOptions = {
    // BUG: followRedirect seems to have no effect
    // followRedirect:(resp)=>{
    //   console.log("@@@ REDIRECT=", resp);
    //   return true;
    // },
  };

  /**
   * Check if suq() response follows structure of an AppleNews redirect
   *  json.tags.links[0] = {text:'Click here', href:[redirect url]}
   * @param suqRes 
   */
  const isAppleNewsRedirect = (suqRes:any):string|boolean => {
    try {
      let redirect = suqRes.tags.links.find(o=>{ return o.text.toLowerCase()==='click here';});
      if (!redirect){
        // try again, look at hrefs
        redirect = suqRes.tags.links.find(o=>{ return !o.href.startsWith('https://www.apple.com');});
      }
      if (redirect) {
        // get redirect
        // console.log("### AppleNews detected:", redirect.href);
        return redirect.href;
      }
    } catch (err) {
      console.error(err);
    }
    return false;
  }

  /**
   * wrap suq() call inside CORS(corsOptions)( =>{ scrape() })
   * @param url 
   * @param res 
   */
  const scrape = (url, res)=>{
    return suq( url
      , (err, json, body)=>{
        if (err) 
          return res.send(err);

        const openGraphTags = json.opengraph || {};
        // const images = json.tags && json.tags.images;
        if (!!openGraphTags['og:url']){
          // console.log("og:resp=", openGraphTags);
          return res.send(openGraphTags);
        }
        else 
        {
          // console.log("NO OPENGRAPH TAGS, url=", url);
          const redirectUrl = isAppleNewsRedirect(json);
          if (redirectUrl) {
            console.log( ">>> suq(), redirect=", redirectUrl);
            return scrape( redirectUrl, res)
          }
          else {
            // not an AppleNews suq() response, patch opengraph resp with original redirect url
            openGraphTags['url'] = url;  // fallback url
            return res.send(openGraphTags);
          };
        }
        
      }
      , requestOptions);
  };

  const corsOptions = {
    // origin: true,
    origin: (origin:string, cb)=>{
      if (!origin || ~CORS_WHITELIST.indexOf(origin)) 
        cb(null, true);
      else cb(new Error("CORS no access allowed"));
    }
  };

  const corsResp = cors(corsOptions);
  return corsResp( request, response, ()=>{

    scrape( request.params.url, response);

  });

});

