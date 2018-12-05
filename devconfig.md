
# mappi3 dev config
```
ionic start mappi3 sidemenu --type=angular
cd mappi3
npm run build
npm install @types/googlemaps --save-dev

npm install --save @capacitor/cli @capacitor/core
npm uninstall --save cordova-plugin-splashscreen

npx cap init mappi3 com.snaphappi.mappi3
```

## angular qrcode generator
```
npm install angularx-qrcode --save
```

## platform capacitor-IOS
###install cocoapods
see: https://guides.cocoapods.org/using/getting-started.html#installation
```
sudo gem install cocoapods


ionic cap update
#npx cap remove ios
# configure Swift version, see: https://github.com/ionic-team/capacitor/pull/614
npx cap add ios
npm uninstall --save cordova-plugin-splashscreen




# build and deploy
npx cap open ios
npm run build; npx cap copy
# build project in Xcode
```


### add cordova qrscanner
```
npm install cordova-plugin-camera-with-exif
npm install --save @ionic-native/qr-scanner@5.0.0-beta.15
npx cap update

# also for encoding see: https://github.com/Cordobo/angularx-qrcode
npm install angularx-qrcode --save
```

## ionic update
```
npm update
npx cap sync
npm run build; npx cap copy


```


## platform Cordova:ios - Add Cordova platform AFTER Capacitor
> FIX: hide capacitor folder & install ionic-native/cordova
```
# <!-- hide Capacitor -->
<!-- temporarily rename Capacitor folder: ./ios  -->

# <!-- add Cordova/ionic native  -->
ionic integrations enable cordova
ionic cordova run ios
npm install --save @ionic-native/camera@beta
ionic cordova plugin add cordova-plugin-camera-with-exif
ionic cordova prepare ios

# <!-- re-add Capacitor by restoring folder name -->
npm uninstall --save cordova-plugin-splashscreen
npx cap open ios
npx cap update
npm run build; ionic capacitor copy ios

```

## Add Native LaunchNavigator
see: https://github.com/dpa99c/phonegap-launch-navigator

> remember to rename Capacitor `ios` folder when adding Cordova plugin
```
ionic cordova plugin add uk.co.workingedge.phonegap.plugin.launchnavigator
npm install --save @ionic-native/launch-navigator@beta
npm uninstall --save cordova-plugin-splashscreen
```

> MANUALLY add to ./mappi3/ios/App/App/Info.plist
```
  
  <key>LSApplicationQueriesSchemes</key>
  <array>
    <string>citymapper</string>
    <string>comgooglemaps</string>
    <string>navigon</string>
    <string>transit</string>
    <string>waze</string>
    <string>yandexnavi</string>
    <string>uber</string>
    <string>tomtomhome</string>
    <string>com.sygic.aura</string>
    <string>here-route</string>
    <string>moovit</string>
    <string>lyft</string>
    <string>mapsme</string>
    <string>cabify</string>
    <string>baidumap</string>
    <string>taxis99</string>
    <string>iosamap</string>
  </array>

```


## ionic native photo library
> NOTE: PhotoLibraryProtocol.swift is NOT supported with Capacitor. Just remove from project
and all references

```
mv ios ios.0
cordova platform remove ios
# update swift support to 1.7
cordova plugin rm cordova-plugin-add-swift-support --force
cordova plugin add cordova-plugin-add-swift-support
# use forked lib at https://github.com/mixuala/cordova-plugin-photo-library.git
ionic cordova plugin add https://github.com/mixuala/cordova-plugin-photo-library.git --variable PHOTO_LIBRARY_USAGE_DESCRIPTION="To choose photos"
npm install --save @ionic-native/photo-library@beta
ionic cordova prepare ios

# restore capacitor
mv ios.0 ios
npx cap sync
npx cap open ios

```


```
# TODO: look at ionic-webview to see if it solves the 'cdvphotolibrary://' protocol issue with WKWebView  
ionic cordova plugin add cordova-plugin-ionic-webview
npm install --save @ionic-native/ionic-webview@beta

// typescript: /snappi.dev/ionic4/mappi3/src/tsconfig.app.json
  "include": [
    "../node_modules/cordova-plugin-photo-library/PhotoLibrary.d.ts"
  ]
}
```


# firebase hosting with Google Cloud Functions
> https://firebase.google.com/docs/hosting/functions

```
firebase init functions
# choose TypeScript, install dependencies with npm, 

cd ./functions
npm install suq --save
npm audit fix
```