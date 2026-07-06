import { Alert, Button, Input, Select, Switch } from '@arco-design/web-react';
import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { configService } from '@/common/config/configService';
import NomiScrollArea from '@/renderer/components/base/NomiScrollArea';
import PreferenceRow from './SystemModalContent/PreferenceRow';

type KnowledgeMode = 'enterprise' | 'personal' | 'disabled';

const DEFAULT_MODE: KnowledgeMode = 'personal';

const EnterpriseSettingsContent: React.FC = () => {
  const { t } = useTranslation();
  const [enabled, setEnabled] = useState(false);
  const [baseUrl, setBaseUrl] = useState('');
  const [workspaceId, setWorkspaceId] = useState('');
  const [authToken, setAuthToken] = useState('');
  const [knowledgeMode, setKnowledgeMode] = useState<KnowledgeMode>(DEFAULT_MODE);

  useEffect(() => {
    let disposed = false;
    void configService.whenReady().then(() => {
      if (disposed) return;
      setEnabled(configService.get('enterprise.enabled') ?? false);
      setBaseUrl(configService.get('enterprise.baseUrl') ?? '');
      setWorkspaceId(configService.get('enterprise.workspaceId') ?? '');
      setAuthToken(configService.get('enterprise.authToken') ?? '');
      setKnowledgeMode(configService.get('enterprise.knowledgeMode') ?? DEFAULT_MODE);
    });
    return () => {
      disposed = true;
    };
  }, []);

  const save = useCallback(async () => {
    await configService.setBatch({
      'enterprise.enabled': enabled,
      'enterprise.baseUrl': baseUrl.trim(),
      'enterprise.workspaceId': workspaceId.trim(),
      'enterprise.authToken': authToken.trim(),
      'enterprise.knowledgeMode': knowledgeMode,
    });
  }, [authToken, baseUrl, enabled, knowledgeMode, workspaceId]);

  const modeOptions = [
    { label: t('settings.enterprise.modeEnterprise', { defaultValue: '企业知识来源' }), value: 'enterprise' },
    { label: t('settings.enterprise.modePersonal', { defaultValue: '个人资料库' }), value: 'personal' },
    { label: t('settings.enterprise.modeDisabled', { defaultValue: '禁用知识检索' }), value: 'disabled' },
  ];

  return (
    <NomiScrollArea className='h-full pb-16px'>
      <div className='px-[12px] md:px-[32px] py-16px bg-2 rd-16px space-y-14px'>
        <div>
          <div className='text-18px font-600 text-t-primary'>
            {t('settings.enterprise.title', { defaultValue: '企业连接' })}
          </div>
          <div className='mt-4px text-13px leading-18px text-t-tertiary'>
            {t('settings.enterprise.subtitle', {
              defaultValue: '配置桌面员工工作台连接企业服务端；知识管理、审核和 RAG 配置由独立后台负责。',
            })}
          </div>
        </div>

        <Alert
          type='warning'
          content={t('settings.enterprise.tokenPhaseOneNotice', {
            defaultValue: '阶段一会把企业 Token 暂存在客户端偏好中；后续版本会迁移到专用加密凭据。',
          })}
        />

        <div className='divide-y divide-border-2'>
          <PreferenceRow
            label={t('settings.enterprise.enabled', { defaultValue: '启用企业服务端' })}
            description={t('settings.enterprise.enabledDesc', {
              defaultValue: '开启后，企业知识模式会优先通过企业服务端检索。',
            })}
          >
            <Switch checked={enabled} onChange={setEnabled} />
          </PreferenceRow>
          <PreferenceRow label={t('settings.enterprise.baseUrl', { defaultValue: '服务端地址' })}>
            <Input
              className='w-320px'
              value={baseUrl}
              onChange={setBaseUrl}
              placeholder='https://enterprise.example.com'
            />
          </PreferenceRow>
          <PreferenceRow label={t('settings.enterprise.workspaceId', { defaultValue: '工作区 ID' })}>
            <Input className='w-240px' value={workspaceId} onChange={setWorkspaceId} placeholder='workspace-id' />
          </PreferenceRow>
          <PreferenceRow label={t('settings.enterprise.authToken', { defaultValue: '访问 Token' })}>
            <Input.Password className='w-320px' value={authToken} onChange={setAuthToken} placeholder='token' />
          </PreferenceRow>
          <PreferenceRow
            label={t('settings.enterprise.knowledgeMode', { defaultValue: '知识来源模式' })}
            description={t('settings.enterprise.knowledgeModeDesc', {
              defaultValue: '企业模式只检索和引用；个人模式保留本地资料库挂载与写回。',
            })}
          >
            <Select
              className='w-220px'
              value={knowledgeMode}
              options={modeOptions}
              onChange={(v) => setKnowledgeMode(v as KnowledgeMode)}
            />
          </PreferenceRow>
        </div>

        <div className='flex justify-end'>
          <Button type='primary' onClick={() => void save()}>
            {t('common.save')}
          </Button>
        </div>
      </div>
    </NomiScrollArea>
  );
};

export default EnterpriseSettingsContent;
