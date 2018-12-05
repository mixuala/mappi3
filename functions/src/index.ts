import * as functions from 'firebase-functions';
import * as suq from 'suq';

// // Start writing Firebase Functions
// // https://firebase.google.com/docs/functions/typescript
//
// export const helloWorld = functions.https.onRequest((request, response) => {
//  response.send("Hello from Firebase!");
// });

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

export const getOpenGraph = functions.https.onRequest((request, response) => {
  request.params = params(request);
  suq( request.params.url, (err, json, body)=>{
    if (err) return response.send(err);
    const openGraphTags = json.opengraph;
    return response.send(openGraphTags);
  })
});

