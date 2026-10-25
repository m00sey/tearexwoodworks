# make zip   -> dist/tearexwoodworks-site.zip, the contents of site/ for Bluehost
# make clean -> remove it

ZIP = dist/tearexwoodworks-site.zip

.PHONY: zip clean

zip:
	@mkdir -p dist
	@rm -f $(ZIP)
	@cd site && zip -q -r ../$(ZIP) . -x ".DS_Store" "*/.DS_Store" "contact*.php" "contact-log.txt" "img/*.jpg" "img/*.jpeg" "img/*.JPG" "img/*.heic"
	@unzip -l $(ZIP) | tail -1
	@echo "wrote $(ZIP)"

clean:
	rm -f $(ZIP)
