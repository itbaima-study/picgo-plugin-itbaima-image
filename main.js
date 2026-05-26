'use strict'

/**
 * @typedef {import('picgo').IPicGo} IPicGo
 * @typedef {import('picgo').IPluginConfig} IPluginConfig
 * @typedef {import('picgo').IImgInfo} IImgInfo
 */

/**
 * 插件配置结构
 * @typedef {Object} PluginConfig
 * @property {string} apiToken
 */

/**
 * 基本返回结构
 * @typedef {Object} BaseResponse
 * @property {boolean} success - 请求是否成功
 * @property {number} status - 状态码
 * @property {*} [data] - 返回数据
 * @property {*} [message] - 返回信息
 */

/**
 * 上传请求的返回数据结构
 * @typedef {Object} UploadResponseData
 * @property {string} id - 图片名称/编号
 * @property {string} url - 图片地址
 * @property {string} mini_url - 缩略图片地址
 */

/**
 * 上传请求的返回结构
 * @typedef {BaseResponse} UploadResponse
 * @property {UploadResponseData} data - 返回数据
 */

/**
 * 删除请求的返回结构
 * @typedef {BaseResponse} DeleteResponse
 */

const ID = 'itbaima_v2'
const SETTINGS_NAME = `picBed.${ID}`
const UA = `PicGo-${ID}`
const BASE_API_URL = 'https://oss.itbaima.cn/api/v2'
const UPLOAD_API_URL = `${BASE_API_URL}/upload`
const DELETE_API_URL = `${BASE_API_URL}/delete`
const WEB_URL = 'https://www.itbaima.cn/space/storage'

const localesZH = {
  NAME: '柏码',
  TOKEN_NAME: 'API 密钥',
  MSG_TOKEN_NEED_CONFIG: '请先配置 API 密钥',
  HEADER_ACCEPT_LANGUAGE: 'zh-CN,zh;q=0.9,en;q=0.8,en-US;q=0.7',
  MSG_UPLOAD_ERROR: '上传失败',
  MSG_FILE_TOO_LARGE: '图片大小超出限制',
  MSG_DELETE_ERROR: '删除失败',
  MSG_UNKNOWN_ERROR: '未知错误，请检查日志并与开发者取得联系',
  MSG_OPEN_IN_BROWSER: '在浏览器中打开图床',
}
const localesEN = {
  NAME: 'ItBaima',
  TOKEN_NAME: 'API token',
  MSG_TOKEN_NEED_CONFIG: 'Please configure the API token',
  HEADER_ACCEPT_LANGUAGE: 'en,en-US;q=0.9,zh-CN;q=0.8,zh;q=0.7',
  MSG_UPLOAD_ERROR: 'Upload error',
  MSG_FILE_TOO_LARGE: 'Image size exceeds limit',
  MSG_DELETE_ERROR: 'Delete error',
  MSG_UNKNOWN_ERROR: 'Unknown error, please check the logs and contact the developer',
  MSG_OPEN_IN_BROWSER: 'Open in browser',
}

/** 获取国际化文案 */
function t(ctx, key) {
  return ctx.i18n.translate(key)
}

/** 获取存储的配置 */
function getConfig(ctx) {
  return (
    ctx.getConfig(SETTINGS_NAME) ??
    ctx.uploaderConfig?.getActiveConfig?.(ID) ?? {
      apiToken: '',
    }
  )
}

/**
 * 获取 PicGo 配置表单
 * @param {IPicGo} ctx
 * @returns{IPluginConfig[]}
 */
function uploadConfig(ctx) {
  const config = getConfig(ctx)
  return [
    {
      name: 'apiToken',
      type: 'input',
      get alias() {
        return t(ctx, 'TOKEN_NAME')
      },
      get message() {
        return t(ctx, 'TOKEN_NAME')
      },
      default: config.apiToken || '',
      required: true,
    },
  ]
}

/**
 * 获取可用配置
 * @param {IPicGo} ctx
 * @returns {PluginConfig|undefined}
 */
function getValidConfig(ctx) {
  const config = getConfig(ctx)
  if (config.apiToken?.trim()) return config

  ctx.emit('notification', {
    title: t(ctx, 'MSG_TOKEN_NEED_CONFIG'),
  })
}

/** 等待指定时间 */
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

/** 创建接口请求头 */
function getHeaders(ctx, apiToken) {
  return {
    'Accept-Language': t(ctx, 'HEADER_ACCEPT_LANGUAGE'),
    'User-Agent': UA,
    'OSS-Token': apiToken,
  }
}

/**
 * 上传图片
 * @param {IPicGo} ctx
 * @param {string} apiToken
 * @param {string} filename
 * @param {Buffer} imgBuf
 * @returns {Promise<UploadResponse>}
 */
async function uploadImage(ctx, apiToken, filename, imgBuf) {
  try {
    const response = await ctx.request({
      url: UPLOAD_API_URL,
      method: 'POST',
      headers: getHeaders(ctx, apiToken),
      formData: {
        file: {
          value: imgBuf,
          options: { filename },
        },
        ssl: 'true',
      },
      json: true,
    })
    if (response?.success && response.data) return response
    throw response
  } catch (e) {
    let errorMessage = `${filename} ${t(ctx, 'MSG_UPLOAD_ERROR')} `
    if (e?.response?.status === 413) {
      errorMessage += t(ctx, 'MSG_FILE_TOO_LARGE')
    } else {
      errorMessage += e?.message ?? t(ctx, 'MSG_UNKNOWN_ERROR')
    }
    throw new Error(errorMessage, { cause: e })
  }
}

/**
 * 上传处理器
 * @param {IPicGo} ctx
 * @returns
 */
async function uploadHandler(ctx) {
  const config = getValidConfig(ctx)
  if (!config) return

  const { apiToken } = config
  for (const imgInfo of ctx.output) {
    const { fileName, buffer, base64Image } = imgInfo
    const img = buffer ?? Buffer.from(base64Image)
    const { data } = await uploadImage(ctx, apiToken, fileName, img)
    imgInfo.fileName = data.id
    // PicGo GUI 相册使用 imgUrl 预览，复制模板优先使用 url。
    imgInfo.url = data.url
    imgInfo.imgUrl = data.mini_url
    imgInfo.miniUrl = data.mini_url
    delete imgInfo.base64Image
    delete imgInfo.buffer
    await sleep(100)
  }
}

/**
 * 删除图片
 * @param {IPicGo} ctx
 * @param {string} apiToken
 * @param {string} id
 * @returns {Promise<DeleteResponse>}
 */
async function deleteImage(ctx, apiToken, id) {
  try {
    const response = await ctx.request({
      url: `${DELETE_API_URL}/${id}`,
      method: 'GET',
      headers: getHeaders(ctx, apiToken),
      json: true,
    })
    if (response?.success) return response
    throw response
  } catch (e) {
    const errorMessage = `${id} ${t(ctx, 'MSG_DELETE_ERROR')} ${e?.message ?? t(ctx, 'MSG_UNKNOWN_ERROR')}`
    throw new Error(errorMessage, { cause: e })
  }
}

/**
 * 删除处理器
 * @param {IPicGo} ctx
 * @param {IImgInfo[]} imgList
 * @returns
 */
async function deleteHandler(ctx, imgList) {
  const config = getValidConfig(ctx)
  if (!config) return

  const { apiToken } = config
  for (const { fileName } of imgList.filter(({ type }) => type === ID)) {
    await deleteImage(ctx, apiToken, fileName)
    await sleep(200)
  }
}

/**
 * 打开网页
 * @param {IPicGo} ctx
 * @param {string} url
 */
async function openBrowser(ctx, url) {
  if (ctx.openUrl) {
    await ctx.openUrl(url)
    return
  }
  const { exec } = require('child_process')
  const platform = require('os').platform()
  if (platform === 'win32') {
    exec(`start ${url}`)
  } else if (platform === 'darwin') {
    exec(`open ${url}`)
  } else {
    exec(`xdg-open ${url}`)
  }
}

/**
 * 插件菜单
 * @param {IPicGo} ctx
 */
function guiMenu(ctx) {
  return [
    {
      label: t(ctx, 'MSG_OPEN_IN_BROWSER'),
      handle: () => openBrowser(ctx, WEB_URL),
    },
  ]
}

/**
 * 栢码图床插件
 * @param {IPicGo} ctx
 */
function main(ctx) {
  const register = () => {
    ctx.i18n.addLocale('zh-CN', localesZH)
    ctx.i18n.addLocale('en', localesEN)
    ctx.helper.uploader.register(ID, {
      get name() {
        return t(ctx, 'NAME')
      },
      handle: uploadHandler,
      config: uploadConfig,
    })
    ctx.on('remove', async (imgList) => {
      await deleteHandler(ctx, imgList)
    })
  }
  return {
    uploader: ID,
    register,
    guiMenu: () => guiMenu(ctx),
  }
}

module.exports = main
