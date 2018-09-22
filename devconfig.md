
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
npm run build
npx cap copy
# build project in Xcode
```


### add cordova qrscanner
```
npm install cordova-plugin-qrscanner
npm install --save @ionic-native/qr-scanner@5.0.0-beta.15
npx cap update
```



## platform Cordova:ios
```
npm run build
cordova platform add ios --save
ionic cordova prepare ios
# npm uninstall --save cordova-plugin-splashscreen

```