//import { Plugin } from 'obsidian';
const obsidian = require('obsidian');

const DEFAULT_SETTINGS = {
    home: 'Home',
    maxDepth: '5',
    separator: '→',
    displayCurrentFile: false,
    showNoticeOnAmbiguity: true,
};

class BacklinksBreadcrumbsPlugin extends obsidian.Plugin {
    registerLayoutChangeEvent() {
        this.layoutChange = app.workspace.on("layout-change", async () => {
            this.drawBreadcrumbs();
        });
        this.registerEvent(this.layoutChange);
    }
    
    async onload() {
        await this.loadSettings();
        
        console.log('loading Backlinks Breadcrumbs plugin');
        
        this.addSettingTab(new BacklinksBreadcrumbsSettingTab(this.app, this));
        
        app.workspace.onLayoutReady(async () => {
            this.drawBreadcrumbs();
            this.registerLayoutChangeEvent();
        });
    }
    
    onunload() {
        
    }
    
    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }
    
    async saveSettings() {
        await this.saveData(this.settings);
    }
    
    drawBreadcrumbs () {
        const backlinks = this.processBacklinks();
        const breadcrumbs = this.generateBreadCrumbs(backlinks);
        
        const activeMDView = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
        if (breadcrumbs && activeMDView) {
            // Destroy the backlinks breadcrumbs element if it exists
            activeMDView.contentEl.querySelector(".backlinks-breadcrumbs")?.remove();
            
            const breadcrumbsEl = createDiv({
                cls: `backlinks-breadcrumbs`,
                attr: {
                    style: `
                        max-width: var(--file-line-width);
                        margin: 0 auto 0.5em auto;
                        font-size: var(--font-ui-small);
                        width: 100%;
                        color: var(--text-muted);
                    `
                }
            });
            
            // Add each breadcrumb to the div
            breadcrumbs.forEach((l, i, a) => {
                breadcrumbsEl.appendChild(l);
                if (i < a.length - 1) breadcrumbsEl.append(` ${this.settings.separator} `);
            });
            const mode = activeMDView.getMode() || 'source';
            if (mode === 'source') {
                activeMDView.contentEl.querySelector('.cm-sizer').prepend(breadcrumbsEl);
            } else {
                activeMDView.contentEl.querySelector('.markdown-preview-view').prepend(breadcrumbsEl);
            }
        }
    }
    
    processBacklinks() {
        const file = app.workspace.getActiveFile();
        if (file) {
            const backlinks = this.getBacklinksForFile(file);
            return backlinks;
        }
    }
    
    getBacklinksForFile(file, result = []) {
        if (file) {
            const filepath = file.path;
            const backlinks = app.metadataCache.getBacklinksForFile(file).data;
            const backlinksCount = Object.keys(backlinks).length;
            
            // Add the currently opened file as a first element
            if (result.length === 0 && this.settings.displayCurrentFile) result.push(filepath);
            
            if (backlinksCount && filepath !== this.settings.home + '.md') {
                // Alert the user about the ambiguity of the ancestry
                if (backlinksCount > 1 && this.settings.showNoticeOnAmbiguity) {
                    new Notice(`Backlinks Breadcrumbs:\nThe ancestry for "${file.basename}" is ambiguous!\nPlease specify it with parent:: Name of file`, 10000);
                }
                
                // Keep only the first backlink
                const backlink = Object.keys(backlinks)[0];
                
                // Add it to the result
                result.unshift(backlink);
                
                // Continue recursively until at Home or reached the maximum depth
                if (backlink !== this.settings.home + '.md' && result.length < Number(this.settings.maxDepth)) {
                    this.getBacklinksForFile(this.getFileByPath(backlink), result);
                }
            }
        }
        return result;
    }
    
    getFileByPath(path) {
        return app.vault.getFiles().find(f => f.path === path);
    }
    
    generateBreadCrumbs(backlinks) {
        if (backlinks) {
            const breadcrumbs = [];
            
            backlinks.forEach(path => {
                breadcrumbs.push(this.createLink(path));
            });
            
            return breadcrumbs;
        }
    }
    
    createLink(target) {
        const link = createEl('span', {
            cls: 'internal-link',
            attr: {
                style: 'cursor: var(--cursor-link);text-decoration: none;'
            }
        });
        link.innerText = this.getFileBaseNameFromPath(target);
        link.addEventListener('click', async (e) => {
            await openOrSwitch(target, e); // This async/await is useless
        });
        return link;
    }
    
    getFileBaseNameFromPath(path) {
        // Keep only the file name, without extension or path 
        let name = path.substring(0, path.lastIndexOf('.')) || path;
        name = name.substring(name.lastIndexOf('/') + 1, name.length) || name;
        return name;
    }
}

module.exports = BacklinksBreadcrumbsPlugin;

// Cherry picked from Obsidian-community-lib #c9aeb89 for brevity, with light reformatting
// Source: https://github.com/obsidian-community/obsidian-community-lib/blob/3721e6f73c610c59a95c8f6eb9c361f625050353/dist/utils.js#L180
// Doc: https://obsidian-community.github.io/obsidian-community-lib/modules.html#openOrSwitch
// License: ISC
async function openOrSwitch(dest, event, options = { createNewFile: true }) {
    const { workspace } = app;
    let destFile = app.metadataCache.getFirstLinkpathDest(dest, "");
    // If dest doesn't exist, make it
    if (!destFile && options.createNewFile) {
        destFile = await createNewMDNote(dest);
    } else if (!destFile && !options.createNewFile) {
        return;
    }
    // Check if it's already open
    const leavesWithDestAlreadyOpen = [];
    // For all open leaves, if the leave's basename is equal to the link destination, rather activate that leaf instead of opening it in two panes
    workspace.iterateAllLeaves((leaf) => {
        var _a;
        if (leaf.view instanceof obsidian.MarkdownView) {
            const file = (_a = leaf.view) === null || _a === void 0 ? void 0 : _a.file;
            if (file && file.basename + "." + file.extension === dest) {
                leavesWithDestAlreadyOpen.push(leaf);
            }
        }
    });
    // Rather switch to it if it is open
    if (leavesWithDestAlreadyOpen.length > 0) {
        workspace.setActiveLeaf(leavesWithDestAlreadyOpen[0]);
    } else {
        const mode = app.vault.getConfig("defaultViewMode");
        const leaf = event.ctrlKey || event.getModifierState("Meta")
            ? workspace.splitActiveLeaf()
            : workspace.getUnpinnedLeaf();
            // This is not how a ternary operator should be used
        await leaf.openFile(destFile, { active: true, mode });
    }
}

class BacklinksBreadcrumbsSettingTab extends obsidian.PluginSettingTab {
    constructor(app, plugin) {
        super(app, plugin);
        this.plugin = plugin;
    }
    
    display() {
        const {containerEl} = this;
        
        containerEl.empty();
                
        new obsidian.Setting(containerEl)
        .setName('Homepage')
        .setDesc('The name of the index or home file of your vault.')
        .addText(text => text
            .setPlaceholder(this.plugin.settings.home)
            .setValue(this.plugin.settings.home)
            .onChange(async (value) => {
                this.plugin.settings.home = value;
                this.plugin.drawBreadcrumbs();
                await this.plugin.saveSettings();
            })
        );
        
        new obsidian.Setting(containerEl)
        .setName('Separator')
        .setDesc('The glyph used to separate the breadcrumbs')
        .addText(text => text
            .setPlaceholder(this.plugin.settings.separator)
            .setValue(this.plugin.settings.separator)
            .onChange(async (value) => {
                this.plugin.settings.separator = value;
                this.plugin.drawBreadcrumbs();
                await this.plugin.saveSettings();
            })
        );
        
        new obsidian.Setting(containerEl)
        .setName('Maximum Depth')
        .setDesc('The maximum depth the plugin will go up the backlinks chain from the current openend file to find Home.')
        .addText(text => text
            .setPlaceholder(this.plugin.settings.maxDepth)
            .setValue(this.plugin.settings.maxDepth)
            .onChange(async (value) => {
                this.plugin.settings.maxDepth = value;
                this.plugin.drawBreadcrumbs();
                await this.plugin.saveSettings();
            })
        );
        
        new obsidian.Setting(containerEl)
        .setName('Show Current File')
        .setDesc('Add the current openend file at the end of the breadcrumbs')
        .addToggle(toggle => toggle
            .setValue(this.plugin.settings.displayCurrentFile)
            .onChange(async (value) => {
                this.plugin.settings.displayCurrentFile = value;
                this.plugin.drawBreadcrumbs();
                await this.plugin.saveSettings();
            })
        );
        
        new obsidian.Setting(containerEl)
        .setName('Show Notice if ambiguous ancestry')
        .setDesc('Display a notice if there is more than one backlink from the currently opened file. You can add the parent:: name_of_file metadata to lift this ambiguity.')
        .addToggle(toggle => toggle
            .setValue(this.plugin.settings.showNoticeOnAmbiguity)
            .onChange(async (value) => {
                this.plugin.settings.showNoticeOnAmbiguity = value;
                await this.plugin.saveSettings();
            })
        );
    }
}
