import { JupyterFrontEnd, JupyterFrontEndPlugin } from '@jupyterlab/application';
import { ABCWidgetFactory, DocumentRegistry, DocumentWidget } from '@jupyterlab/docregistry';
import { Widget } from '@lumino/widgets';

class EpubContentWidget extends Widget {
  constructor(context: DocumentRegistry.IContext<DocumentRegistry.IModel>) {
    super();
    this.addClass('jp-EpubViewer-content');
    
    const container = document.createElement('div');
    container.style.width = '100%';
    container.style.height = '100%';
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
          // Get the raw Base64 string from Jupyter's model storage
          const base64Data = context.model.toString();
          
          // Convert the Base64 data string into a raw binary ArrayBuffer
          const binaryString = window.atob(base64Data);
          const len = binaryString.length;
          const bytes = new Uint8Array(len);
          for (let i = 0; i < len; i++) {
            bytes[i] = binaryString.charCodeAt(i);
          }
          const arrayBuffer = bytes.buffer;

          // Pass the decrypted array buffer directly into the engine layout
          // @ts-ignore
          const book = ePub(arrayBuffer);
          // @ts-ignore
          const rendition = book.renderTo(viewerDiv, { flow: 'scrolled', width: '100%', height: '100%' });
          rendition.display();

          window.addEventListener('keydown', (e) => {
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
