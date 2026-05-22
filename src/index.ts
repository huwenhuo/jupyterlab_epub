import { JupyterFrontEnd, JupyterFrontEndPlugin } from '@jupyterlab/application';
import { ABCWidgetFactory, DocumentRegistry, DocumentWidget } from '@jupyterlab/docregistry';
import { Widget } from '@lumino/widgets';

class EpubContentWidget extends Widget {
  private isSelectingToc = false;

  constructor(context: DocumentRegistry.IContext<DocumentRegistry.IModel>) {
    super();
    this.addClass('jp-EpubViewer-content');
    
    // Make the main widget node container focusable
    this.node.tabIndex = 0;
    this.node.style.outline = 'none'; 
    this.node.style.display = 'flex';
    this.node.style.flexDirection = 'column';
    
    this.node.addEventListener('click', (e) => {
      // Do not steal focus if the click is intended for the TOC dropdown container
      if (this.isSelectingToc) {
        return;
      }
      this.node.focus();
    });
    
    // Create a toolbar area at the top for the Table of Contents
    const toolbar = document.createElement('div');
    toolbar.style.padding = '6px 12px';
    toolbar.style.background = '#f3f3f3';
    toolbar.style.borderBottom = '1px solid #e0e0e0';
    toolbar.style.display = 'flex';
    toolbar.style.alignItems = 'center';
    toolbar.style.gap = '8px';

    const tocLabel = document.createElement('label');
    tocLabel.innerText = 'Contents:';
    tocLabel.style.fontSize = '12px';
    tocLabel.style.fontWeight = 'bold';
    toolbar.appendChild(tocLabel);

    const tocSelect = document.createElement('select');
    tocSelect.style.padding = '4px';
    tocSelect.style.fontSize = '12px';
    tocSelect.style.maxWidth = '300px';
    
    // Track when user enters or interacts with the dropdown to prevent focus stealing
    tocSelect.addEventListener('mouseenter', () => { this.isSelectingToc = true; });
    tocSelect.addEventListener('mouseleave', () => { this.isSelectingToc = false; });
    tocSelect.addEventListener('focus', () => { this.isSelectingToc = true; });
    tocSelect.addEventListener('blur', () => { this.isSelectingToc = false; });
    
    // Placeholder option while the book loads
    const loadingOption = document.createElement('option');
    loadingOption.text = 'Loading chapters...';
    tocSelect.appendChild(loadingOption);
    toolbar.appendChild(tocSelect);
    
    this.node.appendChild(toolbar);
    
    // Main book display area
    const container = document.createElement('div');
    container.style.width = '100%';
    container.style.flex = '1';
    container.style.overflow = 'hidden';
    container.style.background = '#fff';
    
    const viewerDiv = document.createElement('div');
    viewerDiv.style.width = '100%';
    viewerDiv.style.height = '100%';
    container.appendChild(viewerDiv);
    this.node.appendChild(container);

    const jszipScript = document.createElement('script');
    jszipScript.src = 'https://unpkg.com/jszip@3.10.1/dist/jszip.min.js';
    document.head.appendChild(jszipScript);

    jszipScript.onload = () => {
      const epubScript = document.createElement('script');
      epubScript.src = 'https://unpkg.com/epubjs@0.3.93/dist/epub.min.js';
      document.head.appendChild(epubScript);

      epubScript.onload = () => {
        context.ready.then(() => {
          const base64Data = context.model.toString();
          
          const binaryString = window.atob(base64Data);
          const len = binaryString.length;
          const bytes = new Uint8Array(len);
          for (let i = 0; i < len; i++) {
            bytes[i] = binaryString.charCodeAt(i);
          }
          const arrayBuffer = bytes.buffer;

          // @ts-ignore
          const book = ePub(arrayBuffer);
          // @ts-ignore
          const rendition = book.renderTo(viewerDiv, { flow: 'scrolled', width: '100%', height: '100%' });
          rendition.display();

          // Load and display the Table of Contents in the dropdown menu
          book.loaded.navigation.then((nav: any) => {
            tocSelect.innerHTML = ''; // Clear the loading placeholder
            
            nav.forEach((chapter: any) => {
              const option = document.createElement('option');
              option.value = chapter.href;
              option.text = chapter.label.trim();
              tocSelect.appendChild(option);
            });

            // Handle dropdown selection changes to navigate the book
            tocSelect.onchange = (e: Event) => {
              this.isSelectingToc = false; // Menu option selected, safe to unlock focus rules
              const targetHref = (e.target as HTMLSelectElement).value;
              rendition.display(targetHref);
              this.node.focus(); // Pull focus back to retain keyboard inputs
            };
          });

          // Sync the dropdown selection when turning pages manually via arrow keys
          rendition.on('relocated', (location: any) => {
            if (this.isSelectingToc) {
              return; // Do not interrupt selection layouts mid-interaction
            }
            if (location && location.start) {
              const currentHref = location.start.href;
              for (let i = 0; i < tocSelect.options.length; i++) {
                if (currentHref.includes(tocSelect.options[i].value)) {
                  tocSelect.selectedIndex = i;
                  break;
                }
              }
            }
          });

          // Force focus back to the workspace container whenever a page finishes rendering
          rendition.on('rendered', () => {
            if (this.isSelectingToc) {
              return; // Skip refocus execution if the user is currently choosing a chapter
            }
            setTimeout(() => {
              if (this.isSelectingToc) {
                return;
              }
              this.node.focus();
              if (rendition.manager && rendition.manager.views && rendition.manager.views._views) {
                const currentView = rendition.manager.views._views[0];
                if (currentView && currentView.iframe) {
                  currentView.iframe.contentWindow?.focus();
                }
              }
            }, 50); 
          });

          // Intercept key down inside the iframe container views
          rendition.on('keydown', (e: KeyboardEvent) => {
            if (e.key === 'ArrowLeft') rendition.prev();
            if (e.key === 'ArrowRight') rendition.next();
          });

          // Intercept key down inside the outer widget frame container layout
          this.node.addEventListener('keydown', (e: KeyboardEvent) => {
            if (e.key === 'ArrowLeft') rendition.prev();
            if (e.key === 'ArrowRight') rendition.next();
          });
        });
      };
    };
  }
}

class EpubWidgetFactory extends ABCWidgetFactory<DocumentWidget<Widget, DocumentRegistry.IModel>, DocumentRegistry.IModel> {
  protected createNewWidget(context: DocumentRegistry.IContext<DocumentRegistry.IModel>): DocumentWidget<Widget, DocumentRegistry.IModel> {
    const content = new EpubContentWidget(context);
    const widget = new DocumentWidget({ context, content });
    widget.addClass('jp-EpubViewer');
    return widget;
  }
}

const plugin: JupyterFrontEndPlugin<void> = {
  id: 'jupyterlab_epub:plugin',
  autoStart: true,
  activate: (app: JupyterFrontEnd) => {
    const factory = new EpubWidgetFactory({
      name: 'EPUB Viewer',
      fileTypes: ['epub'],
      defaultFor: ['epub'],
      modelName: 'base64' 
    });

    app.docRegistry.addFileType({
      name: 'epub',
      displayName: 'EPUB Book',
      extensions: ['.epub'],
      mimeTypes: ['application/epub+zip'],
      iconClass: 'jp-MaterialIcon jp-BookIcon',
      fileFormat: 'base64'
    });

    app.docRegistry.addWidgetFactory(factory);
  }
};

export default plugin;
