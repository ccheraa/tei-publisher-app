const util = require('./util.js');
const path = require('path');
const FormData = require('form-data');
const chai = require('chai');
const chaiXML = require('chai-xml');
const expect = chai.expect;
const chaiResponseValidator = require('chai-openapi-response-validator');
const jsdom = require("jsdom");
const zip = require('adm-zip');
const { JSDOM } = jsdom;

const spec = path.resolve("./modules/lib/api.json");
chai.use(chaiResponseValidator(spec));
chai.use(chaiXML);

const testXml = `<TEI xmlns="http://www.tei-c.org/ns/1.0">
<teiHeader>
  <fileDesc>
    <titleStmt>
      <title>EPUB Internal References</title>
    </titleStmt>
    <publicationStmt>
      <p/>
    </publicationStmt>
    <sourceDesc>
      <p/>
    </sourceDesc>
  </fileDesc>
</teiHeader>
<text>
  <body>
    <div type="document" n="1" xml:id="d1" subtype="document">
      <head>Document 1</head>
      <list>
          <item><ref xml:id="ref1" target="https://google.com/">Google</ref></item>
          <item><ref xml:id="ref2" target="title.xhtml">Title</ref></item>
          <item><ref xml:id="ref3" target="d2">Document 2</ref></item>
          <item><ref xml:id="ref4" target="d3#p1">Paragraph 1 (relative to Document 3)</ref></item>
          <item><ref xml:id="ref5" target="p2">Paragraph 2 (absolute)</ref></item>
      </list>
    </div>
    <div type="document" n="2" xml:id="d2" subtype="document">
      <head>Document 2</head>
      <p>Document 2 body</p>
    </div>
    <div type="document" n="3" xml:id="d3" subtype="document">
      <head>Document 3</head>
      <p>Document 3 body</p>
      <p xml:id="p1">Paragraph 1</p>
      <p xml:id="p2">Paragraph 2</p>
    </div>
  </body>
</text>
</TEI>`;

function getPages(data) {
  return new zip(Buffer.from(data)).getEntries()
    .filter(({ entryName }) => entryName.startsWith('OEBPS/N'))
    .map(entry => entry);
}

describe('Internal references', function() {
    before(async () => {
      await util.login();
      const formData = new FormData()
      formData.append('files[]', testXml, "internal-ref.xml");
      const res = await util.axios.post('upload/playground', formData, {
          headers: formData.getHeaders()
      });
      expect(res.data).to.have.length(1);
      expect(res.data[0].name).to.equal('/db/apps/tei-publisher/data/playground/internal-ref.xml');
      expect(res).to.satisfyApiSpec;
    });

    it('Should render links with correct urls (internal and external)', async () => {
      const res = await util.axios.get('document/playground%2Finternal-ref.xml/epub', { responseType: 'arraybuffer' });
      expect(res.status).to.equal(200);
      const pages = getPages(res.data);
      const page1 = new JSDOM(pages[0].getData().toString('utf-8'), { contentType: "application/xml" }).window.document;
      
      expect(page1.querySelector('a#ref1').getAttribute('href')).to.equal('https://google.com/');
      
      expect(page1.querySelector('a#ref2').getAttribute('href')).to.equal('title.xhtml');
      
      const page2Ref = page1.querySelector('a#ref3').getAttribute('href');
      const page2 = new JSDOM(pages.find(({ entryName }) => entryName == 'OEBPS/' + page2Ref).getData().toString('utf-8'), { contentType: "application/xml" }).window.document;
      expect(page2.querySelector('#d2')).to.exist;
      
      const page3Ref = page1.querySelector('a#ref4').getAttribute('href').split('#');
      expect(page3Ref[1]).to.equal('p1');
      const page3 = new JSDOM(pages.find(({ entryName }) => entryName == 'OEBPS/' + page3Ref[0]).getData().toString('utf-8'), { contentType: "application/xml" }).window.document;
      expect(page3.querySelector('#d3')).to.exist;
      
      const page4Ref = page1.querySelector('a#ref5').getAttribute('href').split('#');
      expect(page4Ref[1]).to.equal('p2');
      const page4 = new JSDOM(pages.find(({ entryName }) => entryName == 'OEBPS/' + page4Ref[0]).getData().toString('utf-8'), { contentType: "application/xml" }).window.document;
      expect(page4.querySelector('#d3')).to.exist;
    });

    after(util.logout);
});