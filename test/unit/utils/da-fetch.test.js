import { expect } from '@esm-bundle/chai';
import { daFetch, initAuth, testHooks } from '../../../blocks/skills/utils/da-fetch.js';

const DA_URL = 'https://admin.da.live/config/myorg/mysite/';

describe('da-fetch — alternate idp session', () => {
  const realFetch = window.fetch;
  const realLoadHostApi = testHooks.loadHostApi;
  const realAdobeIMS = window.adobeIMS;
  let fetchCalls;

  beforeEach(() => {
    fetchCalls = [];
    window.fetch = async (url, opts = {}) => {
      fetchCalls.push({ url: String(url), headers: { ...(opts.headers || {}) } });
      return new Response('{}', { status: 200 });
    };
    delete window.adobeIMS;
    initAuth(null);
  });

  afterEach(() => {
    window.fetch = realFetch;
    testHooks.loadHostApi = realLoadHostApi;
    window.adobeIMS = realAdobeIMS;
    initAuth(null);
  });

  it('routes DA requests through the host page daFetch when an alternate session exists', async () => {
    const hostCalls = [];
    testHooks.loadHostApi = async () => ({
      useAlt: true,
      loadIms: async () => ({ accessToken: { token: 'hlxtst_account' } }),
      daFetch: async (args) => {
        hostCalls.push(args);
        return new Response('{}', { status: 200 });
      },
    });

    const resp = await daFetch(DA_URL, { method: 'HEAD' });

    expect(resp.status).to.equal(200);
    expect(hostCalls).to.have.length(1);
    expect(hostCalls[0].url).to.equal(DA_URL);
    expect(hostCalls[0].opts.method).to.equal('HEAD');
    expect(fetchCalls).to.have.length(0);
  });

  it('does not use the host daFetch for URLs that never get a token', async () => {
    let hostLoaded = false;
    testHooks.loadHostApi = async () => {
      hostLoaded = true;
      return {};
    };

    await daFetch('https://example.com/data.json');

    expect(hostLoaded).to.equal(false);
    expect(fetchCalls).to.have.length(1);
  });

  it('falls back to a plain request when the host session is anonymous', async () => {
    testHooks.loadHostApi = async () => ({
      useAlt: true,
      loadIms: async () => ({ anonymous: true }),
      daFetch: async () => { throw new Error('should not be called'); },
    });

    await daFetch(DA_URL);

    expect(fetchCalls).to.have.length(1);
    expect(fetchCalls[0].headers.Authorization).to.equal(undefined);
  });

  it('falls back to a plain request when the host page does not use an alternate idp', async () => {
    testHooks.loadHostApi = async () => ({ useAlt: false });

    await daFetch(DA_URL);

    expect(fetchCalls).to.have.length(1);
  });

  it('falls back to a plain request when the host api cannot be loaded', async () => {
    testHooks.loadHostApi = async () => { throw new Error('not found'); };

    await daFetch(DA_URL);

    expect(fetchCalls).to.have.length(1);
  });

  it('keeps using the IMS token directly when one is present', async () => {
    window.adobeIMS = { getAccessToken: () => ({ token: 'ims-token' }) };
    testHooks.loadHostApi = async () => { throw new Error('should not be called'); };

    await daFetch(DA_URL);

    expect(fetchCalls).to.have.length(1);
    expect(fetchCalls[0].headers.Authorization).to.equal('Bearer ims-token');
  });

  it('turns a host daFetch failure into a 500 response', async () => {
    testHooks.loadHostApi = async () => ({
      useAlt: true,
      loadIms: async () => ({ accessToken: { token: 'hlxtst_account' } }),
      daFetch: async () => { throw new Error('network down'); },
    });

    const resp = await daFetch(DA_URL);

    expect(resp.status).to.equal(500);
  });
});
