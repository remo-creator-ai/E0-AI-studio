/** E0 Brand Studio: shared identity and editable starting briefs. */
export const BRAND = {
  name: 'E0 AI Studio',
  company: '주식회사 이원오엠에스',
  website: 'http://eoneoms.com/main/main.php',
  logo: '/e0-mark.svg',
  filePrefix: 'e0',
} as const;

export const CONTENT_STARTS = [
  { id: 'product', title: '제품 소개', en: 'Product story', description: '제품의 특징을 설득력 있는 장면으로.', descriptionEn: 'Turn product features into a compelling story.', brief: '제품명: \n핵심 특징 3가지: \n타깃 고객: \n전달할 메시지: \n원하는 분위기: 깔끔하고 신뢰감 있는 제품 소개', briefEn: 'Product: \nThree key features: \nAudience: \nKey message: \nMood: clear, credible product presentation' },
  { id: 'promotion', title: '매장 프로모션', en: 'Store promotion', description: '행사와 혜택을 짧고 명확하게.', descriptionEn: 'Make your next campaign clear and memorable.', brief: '매장·브랜드명: \n행사명 및 기간: \n안내할 혜택: \n방문 고객: \n핵심 안내 문구: \n원하는 분위기: 명확하고 생동감 있는 매장 프로모션', briefEn: 'Store or brand: \nCampaign and dates: \nOffer: \nAudience: \nCall to action: \nMood: clear, lively store promotion' },
  { id: 'brand', title: '기업·브랜드 소개', en: 'Brand introduction', description: '우리 브랜드의 이야기를 영상으로.', descriptionEn: 'Give your brand story a visual voice.', brief: '회사·브랜드명: \n주요 사업: \n핵심 역량: \n전달할 가치: \n문의·행동 유도 문구: \n원하는 분위기: 전문적이고 단정한 브랜드 소개', briefEn: 'Company or brand: \nBusiness: \nStrengths: \nValues: \nCall to action: \nMood: professional, considered brand introduction' },
] as const;
