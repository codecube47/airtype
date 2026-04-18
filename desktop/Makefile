.PHONY: dev build package-mac package-mac-x64 package-mac-arm64 package-win clean native native-x64

dev:
	npm run dev

build:
	npm run build

package-mac: native
	npm run package:mac

package-mac-x64: native-x64
	npm run package:mac -- --x64

package-mac-arm64: native
	npm run package:mac -- --arm64

native-x64:
	cd native/fn-key && npm run build -- --arch=x64

package-win:
	npm run package:win

clean:
	rm -rf dist dist-electron node_modules/.cache
	cd native/fn-key && rm -rf build/Release

native:
	cd native/fn-key && npm run build
