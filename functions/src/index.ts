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

export const getOpenGraph = functions.https.onRequest((request, response) => {
  request.params = params(request);
  console.log("querystring=", request.params);

  const scrape = (url, res)=>{
    return suq( url, (err, json, body)=>{
      if (err) 
        return res.send(err);

      const openGraphTags = json.opengraph;
      console.log("resp=", openGraphTags);
      return res.send(openGraphTags);
    });
  };

  const corsOptions = {
    origin: true,
    xxxorigin: (origin:string, cb)=>{
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

